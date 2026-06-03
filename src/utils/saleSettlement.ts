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
  resolveCnAvailableFromRows,
  type CreditNoteLiveRow,
} from "@/utils/saleReturnCnBalance";

const SETTLEMENT_TOLERANCE = 0.5;

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
  voucherDate?: string;
  voucherNumber?: string;
  shopName?: string | null;
  createdBy?: string | null;
  /** Default `sale` — invoice-linked receipts must use `sale` to avoid mis-tagged customer rows. */
  referenceType?: "sale" | "customer";
};

/**
 * Create a voucher_entries receipt row.
 * Invoice-linked receipts always use reference_type = 'sale'.
 */
export async function createReceiptVoucher(
  supabase: SupabaseClient,
  params: CreateReceiptVoucherParams,
): Promise<{ id: string; voucher_number: string }> {
  const referenceType = params.referenceType ?? "sale";
  const voucherDate = params.voucherDate || new Date().toISOString().split("T")[0];

  let voucherNumber = params.voucherNumber;
  if (!voucherNumber) {
    const { data: generated, error: numErr } = await supabase.rpc("generate_voucher_number", {
      p_type: "receipt",
      p_date: voucherDate,
    });
    if (numErr) throw numErr;
    voucherNumber = String(generated);
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

  if (error) throw error;
  if (!data?.id) throw new Error("Receipt voucher insert failed");
  return { id: data.id as string, voucher_number: data.voucher_number as string };
}

export type ConsumeAdvanceFIFOParams = {
  customerId: string;
  organizationId: string;
  saleId: string;
  requestedAmount: number;
  voucherDate?: string;
  shopName?: string | null;
  createdBy?: string | null;
};

/**
 * FIFO-consume advance balance; updates customer_advances.used_amount with each receipt voucher.
 */
export async function consumeAdvanceFIFO(
  supabase: SupabaseClient,
  params: ConsumeAdvanceFIFOParams,
): Promise<{ consumed: number; vouchers: string[] }> {
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

  let remaining = params.requestedAmount;
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

    const voucher = await createReceiptVoucher(supabase, {
      organizationId: params.organizationId,
      referenceId: params.saleId,
      amount: consume,
      paymentMethod: "advance_adjustment",
      description: `Adjusted from advance balance for invoice (advance ${adv.advance_number || adv.id})`,
      voucherDate,
      shopName: params.shopName,
      createdBy: params.createdBy,
    });
    voucherIds.push(voucher.id);
  }

  return { consumed: params.requestedAmount - remaining, vouchers: voucherIds };
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

  const returns: AvailableCNReturn[] = rows.map((sr) => {
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
  });

  return {
    total: returns.reduce((sum, r) => sum + r.available, 0),
    returns,
  };
}

function voucherMetaFromAdjustInvoiceRpc(rpcData: unknown): {
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
  const sb = supabase as { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }> };

  for (const sr of pool) {
    if (remaining <= 0.01) break;
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
}): void {
  const { netAmount, items, customerId, paymentMethod, saleReturnAdjust, paidAmount, grossAmount } =
    params;

  if (paymentMethod === "pay_later" && !customerId) {
    throw new Error("Credit sale (Pay Later) requires a customer. Please select a customer.");
  }

  if (!items || items.length === 0) {
    throw new Error("Cannot save sale with no items.");
  }

  const srAdjust = saleReturnAdjust || 0;
  // POS / useSaveSale: net_amount is payable after S/R adjust; merchandise bill = net + S/R (see getExchangeAmounts).
  const billAmount = netAmount + srAdjust;
  const merchandiseGross = Math.max(
    Number(grossAmount) || 0,
    sumMerchandiseGrossFromItems(items),
  );

  // Allow ₹0 payable when items have value (100% line discount / complimentary) or S/R exchange covers bill.
  if (netAmount <= 0 && srAdjust <= 0 && merchandiseGross <= SETTLEMENT_TOLERANCE) {
    throw new Error("Net amount must be greater than zero.");
  }

  // POS exchange: S/R credit can exceed merchandise; negative net is cash/UPI refund due (Mix Payment).
  const refundDue = netAmount < -SETTLEMENT_TOLERANCE;

  if (!refundDue && srAdjust > billAmount + SETTLEMENT_TOLERANCE) {
    throw new Error(
      `Sale return adjustment (₹${srAdjust}) cannot exceed invoice amount (₹${billAmount}).`,
    );
  }

  const maxPayable = netAmount;
  if (maxPayable >= 0 && (paidAmount || 0) > maxPayable + SETTLEMENT_TOLERANCE) {
    throw new Error(`Paid amount (₹${paidAmount}) exceeds payable amount (₹${maxPayable}).`);
  }

  if (!refundDue) {
    const totalCredits = (paidAmount || 0) + srAdjust;
    if (totalCredits > billAmount + SETTLEMENT_TOLERANCE) {
      throw new Error(
        `Total credits (₹${totalCredits}) exceed invoice amount (₹${billAmount}). This would over-credit the customer.`,
      );
    }
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
