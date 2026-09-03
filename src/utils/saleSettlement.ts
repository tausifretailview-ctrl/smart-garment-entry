/**
 * Phase 2 — single source of truth for write-side sale settlement:
 * paid_amount / payment_status, receipt vouchers, advance FIFO, CN availability, pre-save checks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureCreditNoteForSaleReturn } from "@/utils/ensureCreditNoteForSaleReturn";
import {
  creditNoteLiveRemaining,
  ensureCreditNoteHeadroom,
  formatCnApplyError,
  isSaleReturnConsumedAtBilling,
  resolveCnAvailableFromRows,
  type CreditNoteLiveRow,
} from "@/utils/saleReturnCnBalance";
import { fetchCustomerOpeningBalanceRemaining } from "@/utils/customerOpeningBalanceRemaining";

/**
 * DB is authoritative for payment_status on persisted sales:
 *   sale_settlement_tolerance() + derive_sale_payment_status + normalize_sale_payment_status_on_write
 *   (migration 20260824120000) and compute_sale_settlement / trg_sync_sale_payment_status_from_receipts.
 * Client derivePaidAndStatus mirrors the same tolerance for pre-save UX only — do not write a
 * conflicting status when the DB normalizer will override it.
 */
const SETTLEMENT_TOLERANCE = 1.0;

export type SalePaymentStatus = "completed" | "partial" | "pending";

/**
 * Single pure function to determine paid_amount and payment_status for any sale.
 * EVERY save/update/payment path MUST use this instead of inline logic.
 */
export function derivePaidAndStatus(params: {
  netAmount: number;
  saleReturnAdjust: number;
  cashReceived: number;
  advanceApplied: number;
  cnApplied: number;
  discountGiven: number;
  paymentMethod?: string;
}): { paidAmount: number; paymentStatus: SalePaymentStatus } {
  const {
    netAmount,
    cashReceived,
    advanceApplied,
    cnApplied,
    discountGiven,
    paymentMethod,
  } = params;

  // `netAmount` is the payable AFTER sale_return_adjust (see preSaveInvariants:
  // "net_amount is payable after S/R adjust"). The billing return is therefore
  // already baked into `netAmount`; it must NOT be added to `totalSettled` again,
  // otherwise an adjusted-but-unpaid invoice (e.g. net 1,000 with sr 1,000 and
  // ₹0 cash) is wrongly marked "completed". `saleReturnAdjust` is accepted for
  // signature compatibility but intentionally excluded from settlement.
  const totalSettled = cashReceived + advanceApplied + cnApplied + discountGiven;

  const paidAmount = Math.round((cashReceived + advanceApplied + cnApplied + discountGiven) * 100) / 100;

  let paymentStatus: SalePaymentStatus;
  if (totalSettled >= netAmount - SETTLEMENT_TOLERANCE) {
    paymentStatus = "completed";
  } else if (totalSettled > SETTLEMENT_TOLERANCE) {
    paymentStatus = "partial";
  } else {
    paymentStatus =
      paymentMethod === "pay_later"
        ? "pending"
        : netAmount <= SETTLEMENT_TOLERANCE
          ? "completed"
          : "pending";
  }

  return { paidAmount, paymentStatus };
}

export type CreateReceiptVoucherParams = {
  organizationId: string;
  /** Sale id for invoice receipts; customer id for opening-balance receipts. */
  referenceId: string;
  amount: number;
  discountAmount?: number;
  discountReason?: string | null;
  paymentMethod: string;
  description: string;
  /** Which org bank account received this electronic payment (tracking only). */
  receivingBankAccountId?: string | null;
  voucherDate?: string;
  voucherNumber?: string;
  shopName?: string | null;
  createdBy?: string | null;
  /** Default `sale` — invoice-linked receipts must use `sale` to avoid mis-tagged customer rows. */
  referenceType?: "sale" | "customer";
};

/** Files allowed to reference `credit_note_adjustment` (see scripts/check-cn-adjust-literals.sh). */
export const CN_ADJUST_ALLOWED_CALLERS = [
  "saleSettlement.ts",
  "customerBalanceUtils.ts",
  "customerBalanceCore.ts",
  "customerAuditBundle.ts",
  "journalService.ts",
  "InvoiceHistoryDialog.tsx",
  "CustomerLedger.tsx",
  "CustomerLedgerPage.tsx",
  "CreditNoteHistoryDialog.tsx",
  "CustomerBalanceAdjustmentDialog.tsx",
  "OutstandingDashboardTab.tsx",
  "CustomerPaymentTab.tsx",
  "SalesInvoiceDashboard.tsx",
  "AdjustCustomerCreditNoteDialog.tsx",
] as const;

/** True when Postgres rejected a voucher_number that already exists (active unique). */
export function isVoucherNumberUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (!e) return false;
  if (e.code === "23505") {
    const msg = String(e.message || "");
    return (
      msg.includes("uq_voucher_entries_number_active") ||
      msg.includes("voucher_number") ||
      /duplicate key/i.test(msg)
    );
  }
  return /uq_voucher_entries_number_active/i.test(String(e.message || ""));
}

/**
 * After a unique collision, keep multi-invoice / OB suffixes (-1, -OB) on a fresh base.
 * `RCP/26-27/100-1` + newBase `RCP/26-27/105` → `RCP/26-27/105-1`
 */
export function voucherNumberWithRegeneratedBase(
  previousNumber: string | undefined,
  newBase: string,
): string {
  if (!previousNumber) return newBase;
  const m = previousNumber.match(
    /^(RCP|PAY|EXP|JV|CNT|RF|ARF)\/\d{2}-\d{2}\/\d+(-[A-Za-z0-9]+)?$/i,
  );
  if (!m) return newBase;
  return `${newBase}${m[2] || ""}`;
}

const RECEIPT_VOUCHER_NUMBER_MAX_ATTEMPTS = 8;

/**
 * Create a voucher_entries receipt row.
 * Invoice-linked receipts always use reference_type = 'sale'.
 *
 * Retries on `uq_voucher_entries_number_active`: generate_voucher_number's
 * advisory lock ends when the RPC returns, so two concurrent cashiers can still
 * be handed the same RCP before either INSERT lands (TOCTOU).
 */
export async function createReceiptVoucher(
  supabase: SupabaseClient,
  params: CreateReceiptVoucherParams,
): Promise<{ id: string; voucher_number: string }> {
  if (params.paymentMethod === "credit_note_adjustment") {
    throw new Error(
      "credit_note_adjustment vouchers must be created via adjust_invoice_balance RPC (or applyCreditNoteFifoToSale). Direct createReceiptVoucher is forbidden.",
    );
  }
  const referenceType = params.referenceType ?? "sale";
  const voucherDate = params.voucherDate || new Date().toISOString().split("T")[0];

  let lastError: unknown;
  for (let attempt = 0; attempt < RECEIPT_VOUCHER_NUMBER_MAX_ATTEMPTS; attempt++) {
    let voucherNumber = params.voucherNumber;
    if (!voucherNumber || attempt > 0) {
      const { data: generated, error: numErr } = await supabase.rpc("generate_voucher_number", {
        p_type: "receipt",
        p_date: voucherDate,
      });
      if (numErr) throw numErr;
      const newBase = String(generated);
      voucherNumber =
        attempt > 0
          ? voucherNumberWithRegeneratedBase(params.voucherNumber, newBase)
          : newBase;
    }

    const insertRow: Record<string, unknown> = {
      organization_id: params.organizationId,
      voucher_type: "receipt",
      voucher_number: voucherNumber,
      voucher_date: voucherDate,
      reference_type: referenceType,
      reference_id: params.referenceId,
      total_amount: params.amount,
      discount_amount: params.discountAmount ?? 0,
      payment_method: params.paymentMethod,
      description: params.description,
    };
    if (params.receivingBankAccountId) {
      insertRow.receiving_bank_account_id = params.receivingBankAccountId;
    }
    if (params.discountReason != null) {
      insertRow.discount_reason = params.discountReason;
    }
    if (params.createdBy) {
      insertRow.created_by = params.createdBy;
    }

    const { data, error } = await supabase
      .from("voucher_entries")
      .insert(insertRow as never)
      .select("id, voucher_number")
      .single();

    if (!error && data?.id) {
      return { id: data.id as string, voucher_number: data.voucher_number as string };
    }
    if (!error && !data?.id) {
      throw new Error("Receipt voucher insert failed");
    }
    lastError = error;
    if (!isVoucherNumberUniqueViolation(error)) throw error;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(
        String(
          (lastError as { message?: string })?.message ||
            "Failed to allocate a unique receipt voucher number",
        ),
      );
}

export type ConsumeAdvanceFIFOParams = {
  customerId: string;
  organizationId: string;
  /** Sale id for invoice application. Required unless `targetOpeningBalance` is true. */
  saleId?: string;
  /**
   * Apply against customer opening balance (voucher reference_type=customer, reference_id=customerId).
   * Mutually exclusive with saleId. Cap matches fetchCustomerOpeningBalanceRemaining.
   */
  targetOpeningBalance?: boolean;
  requestedAmount: number;
  voucherDate?: string;
  shopName?: string | null;
  createdBy?: string | null;
};

/**
 * How much more advance may be applied to a sale without over-settling.
 *
 * The DB guard only blocks Σ advance_adjustment > net. That still allows
 * cash + advance > net (UZMA KUDIA INV/2841: cash ₹4,149 + advance ₹17,101
 * against net ₹19,149 → ₹2,101 over-apply, sibling invoice left short).
 */
export function advanceApplicationRoomCap(params: {
  netAmount: number;
  alreadyAppliedAdvance: number;
  cashLikeSettled: number;
  saleReturnAdjust?: number;
}): number {
  const net = Math.max(0, Number(params.netAmount) || 0);
  const sr = Math.max(0, Number(params.saleReturnAdjust) || 0);
  const already = Math.max(0, Number(params.alreadyAppliedAdvance) || 0);
  const cashLike = Math.max(0, Number(params.cashLikeSettled) || 0);
  const payable = Math.max(0, net - sr);
  return Math.max(0, Math.round((payable - already - cashLike) * 100) / 100);
}

function isAdvanceOrCnAdjustmentMethod(paymentMethod: string | null | undefined): boolean {
  const pm = String(paymentMethod || "").toLowerCase();
  return pm === "advance_adjustment" || pm === "credit_note_adjustment";
}

/**
 * FIFO-consume advance balance; updates customer_advances.used_amount with each receipt voucher.
 * Sale target: caps so Σ live advance_adjustment on the sale cannot exceed remaining
 * receivable after cash-like receipts (and never exceeds net_amount (+1)).
 * Opening-balance target: caps so application cannot exceed remaining OB (floored at 0).
 *
 * OB voucher description must never include an invoice number — sync_sale_payment_status_from_receipts
 * substring-matches sale numbers in the customer-branch description.
 */
export async function consumeAdvanceFIFO(
  supabase: SupabaseClient,
  params: ConsumeAdvanceFIFOParams,
): Promise<{ consumed: number; vouchers: string[] }> {
  const targetOb = params.targetOpeningBalance === true;
  if (targetOb && params.saleId) {
    throw new Error("consumeAdvanceFIFO: pass saleId or targetOpeningBalance, not both");
  }
  if (!targetOb && !params.saleId) {
    throw new Error("consumeAdvanceFIFO: saleId is required unless targetOpeningBalance is set");
  }

  let room = params.requestedAmount;
  if (room <= 0) return { consumed: 0, vouchers: [] };

  if (targetOb) {
    const obRemaining = await fetchCustomerOpeningBalanceRemaining(
      supabase,
      params.organizationId,
      params.customerId,
    );
    const cappedRoom = Math.max(0, Math.min(room, obRemaining));
    if (cappedRoom <= 0) {
      throw new Error("No opening balance remaining to apply advance against");
    }
    if (params.requestedAmount > obRemaining + 1) {
      throw new Error(
        `Advance over-application blocked. Opening balance remaining ₹${obRemaining.toLocaleString("en-IN")}; requested ₹${params.requestedAmount.toLocaleString("en-IN")}.`,
      );
    }
    room = cappedRoom;
  } else {
    const saleId = params.saleId!;
    const { data: saleRow, error: saleErr } = await supabase
      .from("sales")
      .select("id, net_amount, sale_return_adjust, organization_id, cash_amount, card_amount, upi_amount")
      .eq("id", saleId)
      .eq("organization_id", params.organizationId)
      .is("deleted_at", null)
      .maybeSingle();
    if (saleErr) throw saleErr;
    if (!saleRow) throw new Error("Sale not found for advance application");

    const { data: existingReceiptRows, error: existingErr } = await supabase
      .from("voucher_entries")
      .select("total_amount, discount_amount, payment_method")
      .eq("organization_id", params.organizationId)
      .eq("reference_id", saleId)
      .eq("voucher_type", "receipt")
      .is("deleted_at", null);
    if (existingErr) throw existingErr;

    let alreadyApplied = 0;
    let cashLikeFromReceipts = 0;
    for (const r of existingReceiptRows || []) {
      const amt = (Number(r.total_amount) || 0) + (Number(r.discount_amount) || 0);
      if (isAdvanceOrCnAdjustmentMethod(r.payment_method)) {
        if (String(r.payment_method || "").toLowerCase() === "advance_adjustment") {
          alreadyApplied += Number(r.total_amount) || 0;
        }
        continue;
      }
      cashLikeFromReceipts += amt;
    }

    const tenderOnSale =
      (Number(saleRow.cash_amount) || 0) +
      (Number(saleRow.card_amount) || 0) +
      (Number(saleRow.upi_amount) || 0);
    // Prefer receipt cash; fall back to at-sale tender when no cash-like receipt yet.
    const cashLikeSettled =
      cashLikeFromReceipts > 0.009 ? cashLikeFromReceipts : tenderOnSale;

    const net = Number(saleRow.net_amount) || 0;
    const roomCap = advanceApplicationRoomCap({
      netAmount: net,
      alreadyAppliedAdvance: alreadyApplied,
      cashLikeSettled,
      saleReturnAdjust: Number(saleRow.sale_return_adjust) || 0,
    });

    if (params.requestedAmount > roomCap + 1) {
      throw new Error(
        `Advance over-application blocked. Invoice remaining for advance ₹${roomCap.toLocaleString("en-IN")} (net ₹${net.toLocaleString("en-IN")}, cash settled ₹${cashLikeSettled.toLocaleString("en-IN")}, advance already ₹${alreadyApplied.toLocaleString("en-IN")}); requested ₹${params.requestedAmount.toLocaleString("en-IN")}.`,
      );
    }
    room = Math.max(0, Math.min(room, roomCap));
    if (room <= 0) {
      throw new Error("No remaining balance on this invoice for advance application");
    }
  }

  let remaining = room;

  const { data: advances, error: fetchErr } = await supabase
    .from("customer_advances")
    .select("id, amount, used_amount, advance_number, status")
    .eq("customer_id", params.customerId)
    .eq("organization_id", params.organizationId)
    .in("status", ["active", "partially_used"])
    .order("advance_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (fetchErr) throw fetchErr;
  if (!advances?.length) return { consumed: 0, vouchers: [] };

  const voucherIds: string[] = [];
  const voucherDate = params.voucherDate || new Date().toISOString().split("T")[0];

  for (const adv of advances) {
    if (remaining <= 0.01) break;
    const available = (Number(adv.amount) || 0) - (Number(adv.used_amount) || 0);
    if (available <= 0.01) continue;

    const consume = Math.min(available, remaining);
    remaining -= consume;

    const newUsed = (Number(adv.used_amount) || 0) + consume;
    const advAmount = Number(adv.amount) || 0;
    const { error: updErr } = await supabase
      .from("customer_advances")
      .update({
        used_amount: newUsed,
        status: newUsed >= advAmount - 0.01 ? "fully_used" : "partially_used",
      })
      .eq("id", adv.id);
    if (updErr) throw updErr;

    // OB description: never embed an invoice number (sync_sale_payment_status_from_receipts).
    const description = targetOb
      ? `Adjusted from advance balance for Opening Balance (advance ${adv.advance_number || adv.id})`
      : `Adjusted from advance balance for invoice (advance ${adv.advance_number || adv.id})`;

    const voucher = await createReceiptVoucher(supabase, {
      organizationId: params.organizationId,
      referenceId: targetOb ? params.customerId : params.saleId!,
      referenceType: targetOb ? "customer" : "sale",
      amount: consume,
      paymentMethod: "advance_adjustment",
      description,
      voucherDate,
      shopName: params.shopName,
      createdBy: params.createdBy,
    });
    voucherIds.push(voucher.id);
  }

  return { consumed: room - remaining, vouchers: voucherIds };
}

export type AvailableCNReturn = {
  id: string;
  net_amount: number;
  available: number;
  credit_status: string;
  return_number?: string | null;
  linked_sale_id?: string | null;
  return_date?: string | null;
  credit_available_balance?: number | null;
  refund_type?: string | null;
};

/**
 * Available credit note pool for a customer (all payment flows).
 * Includes pending, partially_adjusted, and adjusted_outstanding.
 */
export async function getAvailableCN(
  supabase: SupabaseClient,
  customerId: string,
  organizationId: string,
  options?: { includeUnlinkedAdjusted?: boolean },
): Promise<{ total: number; returns: AvailableCNReturn[] }> {
  const { data: srs, error } = await supabase
    .from("sale_returns")
    .select(
      "id, net_amount, credit_available_balance, credit_status, return_number, linked_sale_id, return_date, refund_type, credit_note_id",
    )
    .eq("customer_id", customerId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .in("credit_status", ["pending", "partially_adjusted", "adjusted_outstanding"])
    .neq("refund_type", "cash_refund");

  if (error) throw error;

  let rows = srs || [];

  if (options?.includeUnlinkedAdjusted) {
    const { data: unlinked, error: uErr } = await supabase
      .from("sale_returns")
      .select(
        "id, net_amount, credit_available_balance, credit_status, return_number, linked_sale_id, return_date, refund_type, credit_note_id",
      )
      .eq("customer_id", customerId)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("credit_status", "adjusted")
      .is("linked_sale_id", null)
      .neq("refund_type", "cash_refund");
    if (uErr) throw uErr;
    const seen = new Set(rows.map((r) => r.id));
    for (const r of unlinked || []) {
      if (!seen.has(r.id)) rows.push(r);
    }
  }

  if (rows.length === 0) return { total: 0, returns: [] };

  const cnIds = [
    ...new Set(rows.map((r) => String((r as { credit_note_id?: string }).credit_note_id || "").trim()).filter(Boolean)),
  ];
  const cnById = new Map<string, CreditNoteLiveRow>();
  if (cnIds.length > 0) {
    const { data: cnRows, error: cnErr } = await supabase
      .from("credit_notes")
      .select("id, credit_amount, used_amount")
      .eq("organization_id", organizationId)
      .in("id", cnIds)
      .is("deleted_at", null);
    if (cnErr) throw cnErr;
    for (const c of cnRows || []) {
      cnById.set((c as { id: string }).id, c as CreditNoteLiveRow);
    }
  }

  const returns: AvailableCNReturn[] = rows
    .filter((sr) => !isSaleReturnConsumedAtBilling(sr))
    .map((sr) => {
    const cnId = String((sr as { credit_note_id?: string }).credit_note_id || "").trim();
    const cn = cnId ? cnById.get(cnId) : null;
    const available = resolveCnAvailableFromRows(sr, cn);
    return {
      id: sr.id,
      net_amount: Number(sr.net_amount || 0),
      available,
      credit_status: sr.credit_status || "pending",
      return_number: sr.return_number,
      linked_sale_id: sr.linked_sale_id,
      return_date: sr.return_date,
      credit_available_balance: cn ? creditNoteLiveRemaining(cn) : sr.credit_available_balance,
      refund_type: sr.refund_type,
    };
  }).filter((r) => r.available > 0.005);

  return {
    total: returns.reduce((sum, r) => sum + r.available, 0),
    returns,
  };
}

export function voucherMetaFromAdjustInvoiceRpc(rpcData: unknown): {
  voucherEntryId: string;
  voucherNumber: string;
} {
  if (rpcData == null) return { voucherEntryId: "", voucherNumber: "" };
  const row =
    Array.isArray(rpcData) && rpcData.length > 0 && typeof rpcData[0] === "object" && rpcData[0] !== null
      ? (rpcData[0] as Record<string, unknown>)
      : typeof rpcData === "object"
        ? (rpcData as Record<string, unknown>)
        : null;
  if (!row) return { voucherEntryId: "", voucherNumber: "" };
  return {
    voucherEntryId: String(row.voucher_entry_id ?? row.voucher_id ?? row.id ?? ""),
    voucherNumber: String(row.voucher_number ?? ""),
  };
}

export type CnFifoVoucherChunk = {
  voucherEntryId: string;
  voucherNumber: string;
  amount: number;
};

export type ApplyCreditNoteFifoResult = {
  applied: number;
  chunks: CnFifoVoucherChunk[];
};

/**
 * Apply customer CN pool to one invoice via adjust_invoice_balance (FIFO by return_date).
 * Updates sale_returns CAB/status and credit_notes.used_amount after each RPC chunk.
 */
export async function applyCreditNoteFifoToSale(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    saleId: string;
    amount: number;
    cnPool: AvailableCNReturn[];
    customerNameFallback?: string;
    adjustedBy?: string | null;
    notes?: string | null;
  },
): Promise<ApplyCreditNoteFifoResult> {
  const requested = Math.max(0, Math.round(Number(params.amount) * 100) / 100);
  if (requested <= 0.01) {
    return { applied: 0, chunks: [] };
  }

  const pool = [...params.cnPool].sort((a, b) => {
    const da = a.return_date ? new Date(a.return_date).getTime() : 0;
    const db = b.return_date ? new Date(b.return_date).getTime() : 0;
    return da - db;
  });

  let remaining = requested;
  let applied = 0;
  const chunks: CnFifoVoucherChunk[] = [];
  const sb = supabase as unknown as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }> };

  for (const sr of pool) {
    if (remaining <= 0.01) break;
    // Re-read status: billing-absorbed returns must never be FIFO-applied again.
    const { data: liveSr } = await supabase
      .from("sale_returns")
      .select("credit_status, linked_sale_id")
      .eq("id", sr.id)
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    if (isSaleReturnConsumedAtBilling(liveSr || sr)) {
      continue;
    }
    const avail = sr.available;
    if (avail <= 0.01) continue;

    const useFromSR = Math.min(avail, remaining);
    const creditNoteId = await ensureCreditNoteForSaleReturn(supabase, {
      organizationId: params.organizationId,
      saleReturnId: sr.id,
      creditNoteIdHint: null,
      customerNameFallback: params.customerNameFallback,
      returnNumberFallback: sr.return_number || undefined,
      creditAmountFallback: sr.net_amount,
    });
    if (!creditNoteId) continue;

    await ensureCreditNoteHeadroom(supabase, {
      organizationId: params.organizationId,
      creditNoteId,
      amountNeeded: useFromSR,
      maxPoolFromReturn: avail,
      saleReturnId: sr.id,
    });

    const { data: rpcData, error: rpcErr } = await sb.rpc("adjust_invoice_balance", {
      p_organization_id: params.organizationId,
      p_invoice_id: params.saleId,
      p_adjustment_type: "CREDIT_NOTE",
      p_source_document_id: creditNoteId,
      p_amount_applied: useFromSR,
      p_adjusted_by: params.adjustedBy ?? null,
      p_notes: params.notes ?? null,
    });
    if (rpcErr) throw rpcErr;

    const { voucherEntryId, voucherNumber } = voucherMetaFromAdjustInvoiceRpc(rpcData);
    if (!voucherEntryId) {
      throw new Error("Receipt voucher missing after credit-note adjustment.");
    }
    chunks.push({
      voucherEntryId,
      voucherNumber,
      amount: useFromSR,
    });

    const { data: cnRow } = await supabase
      .from("credit_notes")
      .select("credit_amount, used_amount")
      .eq("id", creditNoteId)
      .maybeSingle();
    const cnRemaining = Math.max(
      0,
      Number(cnRow?.credit_amount || 0) - Number(cnRow?.used_amount || 0),
    );
    await supabase
      .from("sale_returns")
      .update({
        credit_available_balance: cnRemaining,
        credit_status: cnRemaining <= 0.01 ? "adjusted" : "partially_adjusted",
        linked_sale_id: params.saleId,
      })
      .eq("id", sr.id)
      .eq("organization_id", params.organizationId);

    sr.available = cnRemaining;
    remaining -= useFromSR;
    applied += useFromSR;
  }

  applied = Math.round(applied * 100) / 100;
  if (applied < requested - 0.01) {
    throw new Error(
      formatCnApplyError(
        new Error(
          `Insufficient credit note balance. Applied ₹${applied.toLocaleString("en-IN")}, requested ₹${requested.toLocaleString("en-IN")}.`,
        ),
      ),
    );
  }

  if (applied > 0.01) {
    try {
      const { applyRecomputedSalePaymentState } = await import(
        "@/utils/recomputeSalePaymentState"
      );
      await applyRecomputedSalePaymentState(params.saleId, params.organizationId, supabase);
    } catch (recomputeErr) {
      console.warn("CN FIFO: sale payment recompute failed", params.saleId, recomputeErr);
    }
    // SRA can over-settle an advance-paid invoice; restore unused advance bookings.
    try {
      const { releaseExcessAdvanceOnSale } = await import(
        "@/utils/releaseExcessAdvanceSettlement"
      );
      await releaseExcessAdvanceOnSale(params.organizationId, params.saleId, supabase);
    } catch (releaseErr) {
      console.warn("CN FIFO: excess advance release failed", params.saleId, releaseErr);
    }
  }

  return { applied, chunks };
}

/** Sum line gross (MRP × qty) from cart rows — used when net is ₹0 after 100% discount. */
function sumMerchandiseGrossFromItems(items: unknown[]): number {
  if (!items?.length) return 0;
  return items.reduce<number>((sum, raw) => {
    const row = raw as { quantity?: number; mrp?: number };
    const qty = Number(row.quantity) || 0;
    const mrp = Number(row.mrp) || 0;
    if (qty <= 0 || mrp <= 0) return sum;
    return sum + mrp * qty;
  }, 0);
}

const roundMoney2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

/**
 * Max S/R adjust that keeps payable net ≥ 0.
 * `payableAfterCurrentSr` is the current bill total (already net of `currentSr`).
 */
export function maxSaleReturnAdjustForPayable(
  payableAfterCurrentSr: number,
  currentSr: number,
): number {
  return Math.max(0, roundMoney2((Number(payableAfterCurrentSr) || 0) + (Number(currentSr) || 0)));
}

/**
 * Payment vouchers written for POS same-bill exchange cash refunds.
 * Must be excluded from customerPaymentDebits — the S/R / refund_amount path
 * already settles that overflow; counting the voucher again phantom-credits the customer.
 */
export function isPosExchangeRefundPaymentVoucher(v: {
  description?: string | null;
  payment_method?: string | null;
}): boolean {
  const desc = String(v.description || "").toLowerCase();
  return (
    desc.includes("refund paid for pos exchange") ||
    desc.includes("round off adjustment for pos exchange")
  );
}

/**
 * Same-bill exchange excess (return > bill) with keep-net≥0 persistence.
 * - Before save cap: net may be negative; excess = |net|.
 * - After save cap: net≈0, sra=applied; excess comes from explicit refund_amount / CN amount.
 */
export function computeExchangeRefundDue(params: {
  netAmount: number;
  saleReturnAdjust: number;
  explicitRefundAmount?: number;
}): {
  billAmount: number;
  appliedSr: number;
  refundDue: number;
  isExchangeRefund: boolean;
} {
  const sra = Math.max(0, roundMoney2(params.saleReturnAdjust));
  const net = roundMoney2(params.netAmount);
  const billAmount = Math.max(0, roundMoney2(net + sra));
  const explicit = Math.max(0, roundMoney2(params.explicitRefundAmount || 0));
  const legacyExcess = net < -SETTLEMENT_TOLERANCE ? roundMoney2(-net) : 0;
  const refundDue = Math.max(explicit, legacyExcess);
  const appliedSr =
    billAmount > 0.005 ? Math.min(sra, billAmount) : Math.max(0, roundMoney2(sra - refundDue));
  const isExchangeRefund =
    sra > 0.005 && billAmount > 0.005 && refundDue > 0.005 && net <= SETTLEMENT_TOLERANCE;
  return { billAmount, appliedSr, refundDue, isExchangeRefund };
}

/**
 * Cap S/R adjust so net_amount cannot go negative. Excess credit must stay on the
 * customer's pending return/CN balance (not absorbed into a negative net) — unless the
 * caller intentionally settles that excess via cash refund or a credit note.
 * `netAmount` is payable AFTER the requested adjust (POS / useSaveSale convention).
 */
export function normalizeSaleReturnAdjustAgainstBill(params: {
  netAmount: number;
  saleReturnAdjust: number;
}): {
  netAmount: number;
  saleReturnAdjust: number;
  excess: number;
  wasCapped: boolean;
  maxApply: number;
} {
  const requested = Math.max(0, roundMoney2(params.saleReturnAdjust));
  const net = roundMoney2(params.netAmount);
  const billBeforeSr = roundMoney2(net + requested);
  const maxApply = Math.max(0, billBeforeSr);
  const capped = Math.min(requested, maxApply);
  const excess = roundMoney2(requested - capped);
  const adjustedNet = Math.max(0, roundMoney2(net + excess));
  return {
    netAmount: adjustedNet,
    saleReturnAdjust: capped,
    excess,
    wasCapped: excess > 0.005 || adjustedNet > net + 0.005,
    maxApply,
  };
}

/** Max combined line + flat discount allowed against merchandise gross (before S/R). */
export function maxCombinedDiscountForGross(grossAmount: number): number {
  return Math.max(0, roundMoney2(grossAmount));
}

/**
 * Cap discount_amount + flat_discount_amount to gross_amount (S/R not considered).
 * Prefer reducing flat (bill-level) first, then line. Lifts net by any excess removed
 * so over-discount cannot silently create a negative payable.
 */
export function normalizeDiscountsAgainstGross(params: {
  grossAmount: number;
  discountAmount: number;
  flatDiscountAmount: number;
  netAmount: number;
}): {
  discountAmount: number;
  flatDiscountAmount: number;
  netAmount: number;
  excess: number;
  wasCapped: boolean;
  maxApply: number;
} {
  const gross = Math.max(0, roundMoney2(params.grossAmount));
  const line = Math.max(0, roundMoney2(params.discountAmount));
  const flat = Math.max(0, roundMoney2(params.flatDiscountAmount));
  const net = roundMoney2(params.netAmount);
  const maxApply = gross;
  const combined = roundMoney2(line + flat);

  if (combined <= maxApply + 0.005) {
    return {
      discountAmount: line,
      flatDiscountAmount: flat,
      netAmount: net,
      excess: 0,
      wasCapped: false,
      maxApply,
    };
  }

  const cappedLine = Math.min(line, maxApply);
  const cappedFlat = Math.min(flat, Math.max(0, roundMoney2(maxApply - cappedLine)));
  const applied = roundMoney2(cappedLine + cappedFlat);
  const excess = roundMoney2(combined - applied);
  const adjustedNet = Math.max(0, roundMoney2(net + excess));

  return {
    discountAmount: cappedLine,
    flatDiscountAmount: cappedFlat,
    netAmount: adjustedNet,
    excess,
    wasCapped: true,
    maxApply,
  };
}

/**
 * Validate before any sale insert/update. Throws before DB writes.
 */
export function preSaveInvariants(params: {
  netAmount: number;
  items: unknown[];
  customerId?: string | null;
  paymentMethod?: string;
  saleReturnAdjust?: number;
  paidAmount?: number;
  /** Pre-discount bill total (POS grossAmount). Allows zero net when gross is positive (100% discount). */
  grossAmount?: number;
  discountAmount?: number;
  flatDiscountAmount?: number;
}): void {
  const {
    netAmount,
    items,
    customerId,
    paymentMethod,
    saleReturnAdjust,
    paidAmount,
    grossAmount,
    discountAmount,
    flatDiscountAmount,
  } = params;

  if (paymentMethod === "pay_later" && !customerId) {
    throw new Error("Credit sale (Pay Later) requires a customer. Please select a customer.");
  }

  if (!items || items.length === 0) {
    throw new Error("Cannot save sale with no items.");
  }

  const srAdjust = saleReturnAdjust || 0;
  // POS / useSaveSale: net_amount is payable after S/R adjust; merchandise bill = net + S/R.
  const billAmount = roundMoney2(netAmount + srAdjust);
  const merchandiseGross = Math.max(
    Number(grossAmount) || 0,
    sumMerchandiseGrossFromItems(items),
  );

  const lineDisc = Math.max(0, Number(discountAmount) || 0);
  const flatDisc = Math.max(0, Number(flatDiscountAmount) || 0);
  const combinedDisc = roundMoney2(lineDisc + flatDisc);
  if (merchandiseGross > 0 && combinedDisc > merchandiseGross + SETTLEMENT_TOLERANCE) {
    throw new Error(
      `Combined discount (₹${combinedDisc.toLocaleString("en-IN")}) cannot exceed bill gross (₹${merchandiseGross.toLocaleString("en-IN")}). Only ₹${merchandiseGross.toLocaleString("en-IN")} discount can be applied to this bill.`,
    );
  }

  // Allow ₹0 payable when items have value (100% line discount / complimentary) or S/R covers bill.
  if (netAmount <= 0 && srAdjust <= 0 && merchandiseGross <= SETTLEMENT_TOLERANCE) {
    throw new Error("Net amount must be greater than zero.");
  }

  // Final net_amount guard (path-agnostic): over-discount or over-S/R must not save negative nets.
  if (netAmount < -SETTLEMENT_TOLERANCE) {
    throw new Error(
      `Net amount cannot be negative (₹${roundMoney2(netAmount)}). Reduce discount or S/R adjust so the bill does not go below zero.`,
    );
  }

  if (srAdjust > billAmount + SETTLEMENT_TOLERANCE) {
    throw new Error(
      `Sale return adjustment (₹${srAdjust}) cannot exceed invoice amount (₹${billAmount}). Only ₹${Math.max(0, billAmount).toLocaleString("en-IN")} of credit can be applied to this bill.`,
    );
  }

  const maxPayable = netAmount;
  if (maxPayable >= 0 && (paidAmount || 0) > maxPayable + SETTLEMENT_TOLERANCE) {
    throw new Error(`Paid amount (₹${paidAmount}) exceeds payable amount (₹${maxPayable}).`);
  }

  const totalCredits = (paidAmount || 0) + srAdjust;
  if (totalCredits > billAmount + SETTLEMENT_TOLERANCE) {
    throw new Error(
      `Total credits (₹${totalCredits}) exceed invoice amount (₹${billAmount}). This would over-credit the customer.`,
    );
  }
}

/** Compare legacy inline status with shared derivation (Phase 2 migration aid). */
export function warnSettlementPathMismatch(
  label: string,
  legacyStatus: string,
  derivedStatus: SalePaymentStatus,
): void {
  if (legacyStatus !== derivedStatus) {
    console.warn(
      `[SETTLEMENT] ${label}: legacy status "${legacyStatus}" vs derivePaidAndStatus "${derivedStatus}" — migrate to saleSettlement.ts`,
    );
  }
}
