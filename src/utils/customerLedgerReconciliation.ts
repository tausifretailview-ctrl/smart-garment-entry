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

/**
 * Economic refundable credit: cash we can pay back to the customer.
 *
 * `invoiceOutstanding` must NOT already net unused advances. SQL
 * `get_customer_true_outstanding` / financial-snapshot `outstanding_dr` still
 * subtract unused_advances in the SUM — do not pass that here (Aafra class:
 * invoice ₹14,800 + unused ₹10,000 must not yield phantom ₹5,200 “Refund owed”).
 *
 * Signed invoice outstanding: >0 customer owes on invoices; <0 invoice-side credit.
 *
 * Pending sale-return / CN credit must already be inside `invoiceOutstanding`
 * (ledger recon `saleReturns`, or balance-core `pendingStandaloneSaleReturns`).
 * When outstanding is Cr, do **not** also add `cnAvailable` — that double-counts
 * the same pending CN (Zohra: POS ₹600 paid + SR pending CN ₹600 → phantom ₹1,200;
 * correct refundable = ₹600).
 *
 * `cnAvailable` still offsets a Dr / nil outstanding (excess CN beyond what they owe).
 */
export function computeRefundableCreditBalance(params: {
  unusedAdvance: number;
  cnAvailable?: number;
  invoiceOutstanding: number;
}): number {
  const unused = Math.max(0, Number(params.unusedAdvance) || 0);
  const cn = Math.max(0, Number(params.cnAvailable) || 0);
  const inv = Number(params.invoiceOutstanding) || 0;
  if (inv < -0.5) {
    // Cr outstanding already embeds pending returns/CN vs cash received.
    return Math.round(Math.abs(inv) + unused);
  }
  return Math.round(Math.max(0, unused + cn - inv));
}
