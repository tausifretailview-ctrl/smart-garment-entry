/**
 * POS Dashboard settlement display — aligns Paid / Not Paid with Cash/Card/UPI columns.
 * At-sale tender lives in cash_amount/card_amount/upi_amount; paid_amount can lag after receipt sync.
 * Mode columns must never show change/over-tender above settled paid (see mixPaymentAllocation).
 */

import { capPaymentModesToSettled } from "@/utils/mixPaymentAllocation";

const SETTLEMENT_EPS = 0.01;

export type PosDashboardSaleLike = {
  payment_status?: string | null;
  payment_method?: string | null;
  sale_number?: string | null;
  gross_amount?: number | null;
  discount_amount?: number | null;
  flat_discount_amount?: number | null;
  points_redeemed_amount?: number | null;
  round_off?: number | null;
  net_amount?: number | null;
  paid_amount?: number | null;
  cash_amount?: number | null;
  card_amount?: number | null;
  upi_amount?: number | null;
  sale_return_adjust?: number | null;
};

export function isHoldLikePosSale(sale: PosDashboardSaleLike): boolean {
  if (sale.payment_status === "hold") return true;
  return (
    sale.payment_status === "pending" &&
    typeof sale.sale_number === "string" &&
    sale.sale_number.startsWith("Hold/") &&
    sale.payment_method === "pay_later"
  );
}

/** Net payable for settlement (matches POS amount column). */
export function getPosSettlementNetAmount(sale: PosDashboardSaleLike): number {
  const discountTotal =
    (Number(sale.discount_amount) || 0) +
    (Number(sale.flat_discount_amount) || 0) +
    (Number(sale.points_redeemed_amount) || 0);
  const srAdjust = Number(sale.sale_return_adjust || 0);
  const baseBillBeforeSR =
    Number(sale.gross_amount || 0) - discountTotal + Number(sale.round_off || 0);
  if (srAdjust > 0 && Number(sale.net_amount || 0) === 0) {
    return Math.round((baseBillBeforeSR - srAdjust) * 100) / 100;
  }
  return Math.round(Number(sale.net_amount || 0) * 100) / 100;
}

export function getPosMixTenderTotal(sale: PosDashboardSaleLike): number {
  return Math.round(
    ((Number(sale.cash_amount) || 0) +
      (Number(sale.card_amount) || 0) +
      (Number(sale.upi_amount) || 0)) *
      100,
  ) / 100;
}

/**
 * Effective cash received on the bill: max(paid_amount, at-sale tender) capped at net payable.
 * Receipt-only paid_amount under-counts when POS stored tender in cash/card/upi columns.
 */
export function getEffectivePaidAmountForPosDashboard(sale: PosDashboardSaleLike): number {
  const stored = Math.round((Number(sale.paid_amount) || 0) * 100) / 100;
  if (isHoldLikePosSale(sale)) return stored;

  const cap = Math.max(0, getPosSettlementNetAmount(sale));
  const tender = getPosMixTenderTotal(sale);
  if (tender <= SETTLEMENT_EPS) return Math.min(cap, stored);

  return Math.min(cap, Math.max(stored, tender));
}

export function isPosSalePaidCompleted(sale: PosDashboardSaleLike): boolean {
  if (isHoldLikePosSale(sale)) return false;
  const net = getPosSettlementNetAmount(sale);
  const paid = getEffectivePaidAmountForPosDashboard(sale);
  const sra = Number(sale.sale_return_adjust || 0);
  return paid + sra >= net - SETTLEMENT_EPS;
}

export function getPosSaleOutstandingBalance(sale: PosDashboardSaleLike): number {
  return Math.max(
    0,
    getPosSettlementNetAmount(sale) -
      getEffectivePaidAmountForPosDashboard(sale) -
      Number(sale.sale_return_adjust || 0),
  );
}

export type PosPaymentModeAmounts = {
  cash: number;
  card: number;
  upi: number;
};

/** Map receipt / POS payment_method to dashboard Cash / Card / UPI columns. */
export function mapPaymentMethodToPosModeColumn(
  method: string | null | undefined,
): keyof PosPaymentModeAmounts {
  const m = String(method || "cash").toLowerCase();
  if (m === "upi") return "upi";
  if (
    m === "card" ||
    m === "cheque" ||
    m === "bank_transfer" ||
    m === "bank" ||
    m === "finance"
  ) {
    return "card";
  }
  return "cash";
}

/**
 * Cash / Card / UPI columns for POS Dashboard.
 * Merges at-sale tender, receipt vouchers, and any paid_amount gap on mix bills
 * (e.g. bank/finance tender stored in paid_amount but not in card_amount).
 */
export function getPosPaymentModeDisplayAmounts(
  sale: PosDashboardSaleLike,
  voucherModeAmounts?: PosPaymentModeAmounts | null,
): PosPaymentModeAmounts {
  let cash = Number(sale.cash_amount) || 0;
  let card = Number(sale.card_amount) || 0;
  let upi = Number(sale.upi_amount) || 0;

  if (voucherModeAmounts) {
    cash += voucherModeAmounts.cash;
    card += voucherModeAmounts.card;
    upi += voucherModeAmounts.upi;
  }

  const tenderSum = Math.round((cash + card + upi) * 100) / 100;
  const effectivePaid = getEffectivePaidAmountForPosDashboard(sale);

  if (effectivePaid > tenderSum + SETTLEMENT_EPS) {
    const gap = Math.round((effectivePaid - tenderSum) * 100) / 100;
    const method = String(sale.payment_method || "").toLowerCase();
    if (method === "upi") upi += gap;
    else if (method === "cash") cash += gap;
    else if (method === "multiple") card += gap;
    else if (
      method === "card" ||
      method === "cheque" ||
      method === "bank_transfer" ||
      method === "bank" ||
      method === "finance"
    ) {
      card += gap;
    } else {
      card += gap;
    }
  } else if (tenderSum > effectivePaid + SETTLEMENT_EPS) {
    // Historical mix over-tender (e.g. cash_amount 8000 on net 4500) — show settled cash only.
    const capped = capPaymentModesToSettled({
      cash,
      card,
      upi,
      settledPaid: effectivePaid,
    });
    cash = capped.cash;
    card = capped.card;
    upi = capped.upi;
  }

  return {
    cash: Math.round(cash * 100) / 100,
    card: Math.round(card * 100) / 100,
    upi: Math.round(upi * 100) / 100,
  };
}
