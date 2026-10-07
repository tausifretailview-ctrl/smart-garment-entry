/**
 * Cashier report refund outflows — S/R Adjust is bill credit, not cash in/out.
 * When sale-return cash_refund rows are missing, infer cash refunds from sales.refund_amount.
 */

export type CashierRefundTotals = {
  totalRefund: number;
  cashRefundTotal: number;
  customerRefundUpi?: number;
  customerRefundCard?: number;
  customerRefundOther?: number;
};

export function cashierNonCashRefundOut(totals: CashierRefundTotals): number {
  return (
    (Number(totals.customerRefundUpi) || 0) +
    (Number(totals.customerRefundCard) || 0) +
    (Number(totals.customerRefundOther) || 0)
  );
}

/** Cash leaving the drawer for refunds (S/R cash + customer cash, or inferred from sales). */
export function cashierCashRefundOut(totals: CashierRefundTotals): number {
  const tracked = Number(totals.cashRefundTotal) || 0;
  if (tracked > 0) return tracked;
  const total = Number(totals.totalRefund) || 0;
  if (total <= 0) return 0;
  const nonCash = cashierNonCashRefundOut(totals);
  return Math.max(0, Math.round((total - nonCash) * 100) / 100);
}
