/**
 * Phase 2 — single source of truth for write-side sale settlement:
 * paid_amount / payment_status, receipt vouchers, advance FIFO, CN availability, pre-save checks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

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
    saleReturnAdjust,
    cashReceived,
    advanceApplied,
    cnApplied,
    discountGiven,
    paymentMethod,
  } = params;

  const totalSettled =
    cashReceived + advanceApplied + cnApplied + discountGiven + saleReturnAdjust;

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
    shop_name: params.shopName ?? null,
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
      "id, net_amount, credit_available_balance, credit_status, return_number, linked_sale_id, return_date, refund_type",
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
        "id, net_amount, credit_available_balance, credit_status, return_number, linked_sale_id, return_date, refund_type",
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

  const returns: AvailableCNReturn[] = rows.map((sr) => ({
    id: sr.id,
    net_amount: Number(sr.net_amount || 0),
    available:
      sr.credit_available_balance != null
        ? Number(sr.credit_available_balance)
        : Number(sr.net_amount || 0),
    credit_status: sr.credit_status || "pending",
    return_number: sr.return_number,
    linked_sale_id: sr.linked_sale_id,
    return_date: sr.return_date,
    credit_available_balance: sr.credit_available_balance,
    refund_type: sr.refund_type,
  }));

  return {
    total: returns.reduce((sum, r) => sum + r.available, 0),
    returns,
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
}): void {
  const { netAmount, items, customerId, paymentMethod, saleReturnAdjust, paidAmount } = params;

  if (paymentMethod === "pay_later" && !customerId) {
    throw new Error("Credit sale (Pay Later) requires a customer. Please select a customer.");
  }

  if (!items || items.length === 0) {
    throw new Error("Cannot save sale with no items.");
  }

  if (netAmount <= 0) {
    throw new Error("Net amount must be greater than zero.");
  }

  if ((saleReturnAdjust || 0) > netAmount + SETTLEMENT_TOLERANCE) {
    throw new Error(
      `Sale return adjustment (₹${saleReturnAdjust}) cannot exceed invoice amount (₹${netAmount}).`,
    );
  }

  const maxPayable = netAmount - (saleReturnAdjust || 0);
  if ((paidAmount || 0) > maxPayable + SETTLEMENT_TOLERANCE) {
    throw new Error(`Paid amount (₹${paidAmount}) exceeds payable amount (₹${maxPayable}).`);
  }

  const totalCredits = (paidAmount || 0) + (saleReturnAdjust || 0);
  if (totalCredits > netAmount + 1.0) {
    throw new Error(
      `Total credits (₹${totalCredits}) exceed invoice amount (₹${netAmount}). This would over-credit the customer.`,
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
