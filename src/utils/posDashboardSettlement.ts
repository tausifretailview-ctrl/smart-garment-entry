/**
 * POS Dashboard settlement display — aligns Paid / Not Paid with Cash/Card/UPI columns.
 * At-sale tender lives in cash_amount/card_amount/upi_amount; paid_amount can lag after receipt sync.
 */

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
