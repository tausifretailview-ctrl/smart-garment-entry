/**
 * Invoice-outstanding arithmetic for Customer Ledger reconciliation.
 *
 * Advance *application* rows are memo-only on the running-balance column
 * (debit/credit 0) but MUST reduce the Outstanding total — otherwise the
 * panel prints lines that sum to ₹0 under a total taken from the last row's
 * party-cash running balance (Anusha Pathan / INV class).
 *
 * Advance *refunds* affect the unused-advance pool, not invoice outstanding —
 * they are excluded from this total (shown separately in the UI).
 */

export type LedgerReconciliationFacets = {
  opening: number;
  grossInvoiced: number;
  invoiceCnApplied: number;
  saleReturns: number;
  paymentsCash: number;
  paymentsDiscount: number;
  advanceApplied: number;
  adjustments: number;
  /** CN cash refunded to customer — increases what they owe / reduces credit. */
  cnRefunded?: number;
};

export function computeInvoiceOutstandingFromReconciliation(
  f: LedgerReconciliationFacets,
): number {
  const cnRefunded = Math.max(0, Number(f.cnRefunded || 0));
  return Math.round(
    Number(f.opening || 0) +
      Number(f.grossInvoiced || 0) -
      Number(f.invoiceCnApplied || 0) -
      Number(f.saleReturns || 0) -
      Number(f.paymentsCash || 0) -
      Number(f.paymentsDiscount || 0) -
      Number(f.advanceApplied || 0) +
      Number(f.adjustments || 0) +
      cnRefunded,
  );
}

/** Sum of the printed recon lines — must equal displayed Outstanding. */
export function sumReconciliationLinesToOutstanding(f: LedgerReconciliationFacets): number {
  return computeInvoiceOutstandingFromReconciliation(f);
}
