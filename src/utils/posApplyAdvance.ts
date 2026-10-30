import type { SupabaseClient } from "@supabase/supabase-js";
import { postAdvanceApplicationJournalsForVouchers } from "@/utils/accounting/journalService";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { fetchCustomerOpeningBalanceRemaining } from "@/utils/customerOpeningBalanceRemaining";
import { applyRecomputedSalePaymentState } from "@/utils/recomputeSalePaymentState";
import { consumeAdvanceFIFO } from "@/utils/saleSettlement";

/** Remaining opening balance above this blocks POS/one-bill advance apply. */
export const POS_ADVANCE_OB_REFUSE_THRESHOLD = 0.01;

export const POS_ADVANCE_OB_TOAST =
  "Settle opening balance on Payments first before applying advance to this bill.";

export const POS_ADVANCE_REFUND_TOAST =
  "Cannot apply advance while this bill is in exchange refund mode.";

export type PosAdvanceApplyBlockReason =
  | "no_customer"
  | "ob_remaining"
  | "refund_mode"
  | "no_room"
  | "none_available";

export function posAdvanceApplyBlockReason(input: {
  customerId?: string | null;
  availableAdvanceBalance: number;
  billRoom: number;
  openingBalanceRemaining: number;
  exchangeRefundDue: number;
}): PosAdvanceApplyBlockReason | null {
  if (!input.customerId) return "no_customer";
  if ((Number(input.exchangeRefundDue) || 0) > 0.005) return "refund_mode";
  if ((Number(input.openingBalanceRemaining) || 0) > POS_ADVANCE_OB_REFUSE_THRESHOLD) {
    return "ob_remaining";
  }
  if ((Number(input.availableAdvanceBalance) || 0) <= 0.01) return "none_available";
  if ((Number(input.billRoom) || 0) <= 0.01) return "no_room";
  return null;
}

export function posAdvanceApplyBlockToast(reason: PosAdvanceApplyBlockReason): string {
  switch (reason) {
    case "no_customer":
      return "Please select a customer to apply advance";
    case "ob_remaining":
      return POS_ADVANCE_OB_TOAST;
    case "refund_mode":
      return POS_ADVANCE_REFUND_TOAST;
    case "none_available":
      return "No unused advance booking for this customer";
    case "no_room":
      return "Nothing left on this bill to apply advance against";
  }
}

/**
 * Cap requested apply at unused bookings and remaining bill (after CN already in
 * `finalAmount`). Does not subtract from persisted `sales.net_amount`.
 */
export function capPosAdvanceApplyAmount(input: {
  requested: number;
  availableAdvanceBalance: number;
  billRoom: number;
}): number {
  const requested = Math.max(0, Number(input.requested) || 0);
  const available = Math.max(0, Number(input.availableAdvanceBalance) || 0);
  const room = Math.max(0, Number(input.billRoom) || 0);
  return Math.round(Math.min(requested, available, room) * 100) / 100;
}

/** Cashier Mix / F1–F3 tender due. Persisted net stays `billFinalAmount`. */
export function posTenderDueAfterAdvance(
  billFinalAmount: number,
  advanceApplied: number,
): number {
  const net = Number(billFinalAmount) || 0;
  const adv = Math.max(0, Number(advanceApplied) || 0);
  return Math.max(0, Math.round((net - adv) * 100) / 100);
}

/** Unused booking pool on the customer (Adv field). `used_amount` is FIFO redeem. */
export function unusedAdvanceFromBookings(
  rows: Array<{ amount?: number | null; used_amount?: number | null }>,
): number {
  const unused = rows.reduce((sum, row) => {
    const available = (Number(row.amount) || 0) - (Number(row.used_amount) || 0);
    return sum + Math.max(0, available);
  }, 0);
  return Math.round(unused * 100) / 100;
}

export type ApplyExistingAdvanceToSaleParams = {
  client: SupabaseClient;
  customerId: string;
  organizationId: string;
  saleId: string;
  saleNumber?: string | null;
  requestedAmount: number;
  voucherDate: string;
  shopName?: string | null;
  createdBy?: string | null;
  /** Consume these advances first (gift voucher redeemed on this bill). */
  preferAdvanceIds?: string[];
};

/**
 * Apply existing `customer_advances` to a sale via `consumeAdvanceFIFO`.
 * Never targets opening balance. Never writes `payment_method: 'advance'`.
 */
export async function applyExistingAdvanceToSale(
  params: ApplyExistingAdvanceToSaleParams,
): Promise<{ consumed: number; vouchers: string[] }> {
  const requested = Math.round((Number(params.requestedAmount) || 0) * 100) / 100;
  if (requested <= 0.01) return { consumed: 0, vouchers: [] };

  const obRemaining = await fetchCustomerOpeningBalanceRemaining(
    params.client,
    params.organizationId,
    params.customerId,
  );
  if (obRemaining > POS_ADVANCE_OB_REFUSE_THRESHOLD) {
    throw new Error(POS_ADVANCE_OB_TOAST);
  }

  const { consumed, vouchers } = await consumeAdvanceFIFO(params.client, {
    customerId: params.customerId,
    organizationId: params.organizationId,
    saleId: params.saleId,
    requestedAmount: requested,
    voucherDate: params.voucherDate,
    shopName: params.shopName,
    createdBy: params.createdBy,
    preferAdvanceIds: params.preferAdvanceIds,
  });

  await applyRecomputedSalePaymentState(params.saleId, params.organizationId, params.client);

  if (consumed > 0.01 && vouchers.length > 0) {
    const { data: acctRow } = await params.client
      .from("settings")
      .select("accounting_engine_enabled")
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    if (isAccountingEngineEnabled(acctRow as { accounting_engine_enabled?: boolean | null } | null)) {
      const journalDesc = params.saleNumber
        ? `Adjusted from advance balance for invoice ${params.saleNumber}`
        : `Adjusted from advance balance for invoice`;
      // One journal per FIFO voucher (each for its own amount). A single journal for the total on
      // the last voucher was reversed in full when only that voucher was released or deleted.
      await postAdvanceApplicationJournalsForVouchers(
        vouchers,
        params.organizationId,
        params.voucherDate,
        journalDesc,
        params.client,
      );
    }
  }

  return { consumed, vouchers };
}

/** Advance / gift voucher adjusted per saved bill (live advance_adjustment receipts), by sale id. */
export async function fetchSalesAdvanceAdjusted(
  client: SupabaseClient,
  organizationId: string,
  saleIds: string[],
): Promise<Map<string, number>> {
  const bySale = new Map<string, number>();
  const ids = [...new Set(saleIds.filter(Boolean))];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await client
      .from("voucher_entries")
      .select("reference_id, total_amount")
      .eq("organization_id", organizationId)
      .in("reference_id", ids.slice(i, i + 200))
      .eq("voucher_type", "receipt")
      .eq("payment_method", "advance_adjustment")
      .is("deleted_at", null);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{ reference_id: string | null; total_amount: number | null }>) {
      if (!row.reference_id) continue;
      bySale.set(row.reference_id, (bySale.get(row.reference_id) ?? 0) + (Number(row.total_amount) || 0));
    }
  }
  for (const [id, sum] of bySale) bySale.set(id, Math.round(sum * 100) / 100);
  return bySale;
}

/** Advance / gift voucher adjusted on a saved bill (live advance_adjustment receipts). */
export async function fetchSaleAdvanceAdjusted(
  client: SupabaseClient,
  organizationId: string,
  saleId: string,
): Promise<number> {
  const bySale = await fetchSalesAdvanceAdjusted(client, organizationId, [saleId]);
  return bySale.get(saleId) ?? 0;
}

/**
 * Part of a bill's advance / gift voucher that is not already inside its tender columns.
 * POS keeps the advance out of cash/card/UPI, but older bills stored the full bill as tender;
 * those keep printing and counting as before.
 */
export function advanceBeyondTender(
  sale: {
    net_amount?: number | null;
    cash_amount?: number | null;
    card_amount?: number | null;
    upi_amount?: number | null;
  },
  advanceAdjusted: number,
): number {
  const adv = Math.max(0, Number(advanceAdjusted) || 0);
  if (adv <= 0.005) return 0;
  const tender =
    Math.max(0, Number(sale.cash_amount) || 0) +
    Math.max(0, Number(sale.card_amount) || 0) +
    Math.max(0, Number(sale.upi_amount) || 0);
  const room = Math.max(0, (Number(sale.net_amount) || 0) - tender);
  return Math.round(Math.min(adv, room) * 100) / 100;
}

/**
 * Counter money on a saved bill, for its print. With an advance adjusted, paid_amount also holds
 * the advance, so the tender columns are the counter part; otherwise paid_amount as before.
 */
export function savedSaleTenderPaid(
  sale: {
    paid_amount?: number | null;
    cash_amount?: number | null;
    card_amount?: number | null;
    upi_amount?: number | null;
  },
  advanceAdjusted: number,
): number {
  const paid = Math.max(0, Number(sale.paid_amount) || 0);
  if ((Number(advanceAdjusted) || 0) <= 0.005) return paid;
  const tender =
    Math.max(0, Number(sale.cash_amount) || 0) +
    Math.max(0, Number(sale.card_amount) || 0) +
    Math.max(0, Number(sale.upi_amount) || 0);
  return Math.round(tender * 100) / 100;
}
