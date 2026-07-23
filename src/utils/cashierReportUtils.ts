/** Sale row fields used for cashier / POS dashboard gross totals. */
export type SaleReportAmountRow = {
  gross_amount?: number | null;
  net_amount?: number | null;
  discount_amount?: number | null;
  flat_discount_amount?: number | null;
  points_redeemed_amount?: number | null;
  round_off?: number | null;
  sale_return_adjust?: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Merchandise gross for reporting. When gross_amount is 0 (rate-only lines, e.g. POS-DC with MRP 0),
 * fall back to net_amount so Gross Sale / Sale Amount match Net Sale collections.
 */
export function getSaleReportGrossAmount(sale: SaleReportAmountRow): number {
  const gross = Number(sale.gross_amount) || 0;
  const net = Number(sale.net_amount) || 0;
  if (gross > 0) return gross;
  return net > 0 ? net : 0;
}

/** Line + bill + points discount only (excludes round-off). */
export function getSaleReportLineDiscountAmount(sale: SaleReportAmountRow): number {
  return (
    (Number(sale.discount_amount) || 0) +
    (Number(sale.flat_discount_amount) || 0) +
    (Number(sale.points_redeemed_amount) || 0)
  );
}

/**
 * Discount for cashier Gross − Discount ≈ Net identity.
 * Round-off is folded in as −round_off (negative round-off increases discount).
 */
export function getSaleReportDiscountAmount(sale: SaleReportAmountRow): number {
  return getSaleReportLineDiscountAmount(sale) - (Number(sale.round_off) || 0);
}

export function getSaleReportRoundOff(sale: SaleReportAmountRow): number {
  return Number(sale.round_off) || 0;
}

/**
 * Billed net for cashier reports (includes round-off when saved correctly).
 * Some rows were stored with the wrong round-off sign (amountBefore − roundOff
 * instead of amountBefore + roundOff), which inflates Net by ~2×|round_off|.
 * Detect that case and report the corrected net.
 */
export function getSaleReportNetAmount(sale: SaleReportAmountRow): number {
  const stored = Number(sale.net_amount) || 0;
  const roundOff = getSaleReportRoundOff(sale);
  if (!roundOff) return stored;

  const gross = getSaleReportGrossAmount(sale);
  if (gross <= 0) return stored;

  const lineDisc = getSaleReportLineDiscountAmount(sale);
  const sr = Number(sale.sale_return_adjust) || 0;
  const amountBefore = round2(gross - lineDisc - sr);
  const expected = round2(amountBefore + roundOff);
  const wrongSign = round2(amountBefore - roundOff);

  if (Math.abs(stored - wrongSign) <= 0.51 && Math.abs(stored - expected) > 0.51) {
    return expected;
  }
  return stored;
}
