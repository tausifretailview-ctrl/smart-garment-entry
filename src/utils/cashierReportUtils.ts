/** Sale row fields used for cashier / POS dashboard gross totals. */
export type SaleReportAmountRow = {
  gross_amount?: number | null;
  net_amount?: number | null;
};

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

export function getSaleReportNetAmount(sale: SaleReportAmountRow): number {
  return Number(sale.net_amount) || 0;
}
