import type { SupabaseClient } from "@supabase/supabase-js";
import { recordCustomerAdvanceApplicationJournalEntry } from "@/utils/accounting/journalService";
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
  });

  await applyRecomputedSalePaymentState(params.saleId, params.organizationId, params.client);

  if (consumed > 0.01 && vouchers.length > 0) {
    const { data: acctRow } = await params.client
      .from("settings")
      .select("accounting_engine_enabled")
      .eq("organization_id", params.organizationId)
      .maybeSingle();
    if (isAccountingEngineEnabled(acctRow as { accounting_engine_enabled?: boolean | null } | null)) {
      const lastVoucherId = vouchers[vouchers.length - 1];
      const journalDesc = params.saleNumber
        ? `Adjusted from advance balance for invoice ${params.saleNumber}`
        : `Adjusted from advance balance for invoice`;
      await recordCustomerAdvanceApplicationJournalEntry(
        lastVoucherId,
        params.organizationId,
        consumed,
        params.voucherDate,
        journalDesc,
        params.client,
      );
    }
  }

  return { consumed, vouchers };
}
