/** Matches saleSettlement.ts SETTLEMENT_TOLERANCE (₹1) — not exported from app code. */
export const MONEY_SETTLEMENT_TOLERANCE = 1.0;

/**
 * Drift: sale marked completed but paid_amount is materially below net.
 * Mirrors the guard used in ledger health / reconciliation screens.
 */
export function isCompletedSaleUnderpaidDrift(sale: {
  payment_status?: string | null;
  net_amount?: number | null;
  paid_amount?: number | null;
}): boolean {
  const status = String(sale.payment_status || "").toLowerCase();
  if (status !== "completed") return false;
  const net = Number(sale.net_amount || 0);
  const paid = Number(sale.paid_amount || 0);
  return paid < net - MONEY_SETTLEMENT_TOLERANCE;
}

/**
 * Drift: sales.paid_amount vs non-advance receipt voucher total (SQL paid_drift CTE).
 */
export function isPaidAmountVoucherDrift(
  paidAmount: number,
  voucherNonAdvTotal: number,
  tolerance = MONEY_SETTLEMENT_TOLERANCE,
): boolean {
  return Math.abs(paidAmount - voucherNonAdvTotal) > tolerance;
}

/** Net receivable rollup — same formula as CustomerLedger summary. */
export function computeNetReceivableFromBalances(balances: number[]): number {
  const grossOutstanding = balances.reduce((sum, b) => sum + Math.max(0, b), 0);
  const creditPool = balances.reduce((sum, b) => sum + Math.max(0, -b), 0);
  return grossOutstanding - creditPool;
}
