import { describe, expect, it } from "vitest";
import {
  computeInvoiceOutstandingFromReconciliation,
  sumReconciliationLinesToOutstanding,
  type LedgerReconciliationFacets,
} from "@/utils/customerLedgerReconciliation";

/**
 * Anusha Pathan–shaped case: invoices paid via cash + advance applications.
 * Advance applications are memo-only on the running-balance column, so the
 * last-row balance can still show a debit while invoice outstanding is ₹0.
 * Phantom/real advance refunds must not change invoice Outstanding.
 */
const ANUSHA_SHAPED: LedgerReconciliationFacets = {
  opening: 0,
  grossInvoiced: 92_500,
  invoiceCnApplied: 0,
  saleReturns: 0,
  paymentsCash: 62_700,
  paymentsDiscount: 0,
  advanceApplied: 29_800,
  adjustments: 0,
  cnRefunded: 0,
};

describe("customerLedgerReconciliation", () => {
  it("Anusha-shaped: recon lines sum to Outstanding ₹0 (not last-row party balance)", () => {
    const outstanding = computeInvoiceOutstandingFromReconciliation(ANUSHA_SHAPED);
    expect(outstanding).toBe(0);
    expect(sumReconciliationLinesToOutstanding(ANUSHA_SHAPED)).toBe(outstanding);

    // Party-cash running balance can still look like ₹8,450 Dr when advance
    // applications are excluded from Dr/Cr — that must NOT be the Outstanding.
    const lastRowPartyCashBalance = 8_450;
    expect(outstanding).not.toBe(lastRowPartyCashBalance);
  });

  it("does not take advance refunds as an input to invoice Outstanding", () => {
    // Facets have no advanceRefunded field — refunds are party-cash / unused-advance
    // and are shown as a note under the total, not subtracted from Outstanding.
    expect(computeInvoiceOutstandingFromReconciliation(ANUSHA_SHAPED)).toBe(0);
    expect(Object.prototype.hasOwnProperty.call(ANUSHA_SHAPED, "advanceRefunded")).toBe(
      false,
    );
  });

  it("includes CN cash refund in Outstanding", () => {
    const facets: LedgerReconciliationFacets = {
      opening: 0,
      grossInvoiced: 10_000,
      invoiceCnApplied: 0,
      saleReturns: 2_000,
      paymentsCash: 8_000,
      paymentsDiscount: 0,
      advanceApplied: 0,
      adjustments: 0,
      cnRefunded: 2_000,
    };
    // Net invoiced 8_000 − cash 8_000 + CN refunded 2_000 = 2_000 Dr
    expect(computeInvoiceOutstandingFromReconciliation(facets)).toBe(2_000);
    expect(sumReconciliationLinesToOutstanding(facets)).toBe(2_000);
  });

  it("advance applications reduce Outstanding even when memo-only on running balance", () => {
    const facets: LedgerReconciliationFacets = {
      opening: 0,
      grossInvoiced: 10_000,
      invoiceCnApplied: 0,
      saleReturns: 0,
      paymentsCash: 3_000,
      paymentsDiscount: 0,
      advanceApplied: 7_000,
      adjustments: 0,
    };
    expect(computeInvoiceOutstandingFromReconciliation(facets)).toBe(0);
  });
});
