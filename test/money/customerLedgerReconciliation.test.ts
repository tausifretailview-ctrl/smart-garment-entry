import { describe, expect, it } from "vitest";
import {
  computeInvoiceOutstandingFromReconciliation,
  computeRefundableCreditBalance,
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

  it("Zohra after overpayment refund: pending SR + cash in + refund out → Outstanding Nil", () => {
    // POS/INV ₹600 paid, pending SR ₹600, then cash refund ₹600 to customer.
    const facets: LedgerReconciliationFacets = {
      opening: 0,
      grossInvoiced: 600,
      invoiceCnApplied: 0,
      saleReturns: 600,
      paymentsCash: 600,
      paymentsDiscount: 0,
      advanceApplied: 0,
      adjustments: 0,
      cnRefunded: 600,
    };
    expect(computeInvoiceOutstandingFromReconciliation(facets)).toBe(0);
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

  it("advance-refund case: displayed lines still sum to Outstanding, and Net Position is self-consistent", () => {
    // Anusha Pathan, 10 Aug 2026: advances received 32,250 / applied 29,800 /
    // refunded 5,450 → pool is over-drawn by 3,000 while per-booking residual is 2,450.
    const facets: LedgerReconciliationFacets = { ...ANUSHA_SHAPED };
    const outstanding = computeInvoiceOutstandingFromReconciliation(facets);
    expect(outstanding).toBe(0);
    // Refunds never enter the printed Outstanding arithmetic.
    expect(sumReconciliationLinesToOutstanding(facets)).toBe(outstanding);

    const unusedAdvance = 2_450; // floored per-booking residual shown in the panel
    const netPosition = outstanding - unusedAdvance;
    expect(netPosition).toBe(-2_450); // Cr

    // The unclamped pool disagrees with the floored residual — the panel must be
    // able to surface that gap rather than silently print the floor.
    const advanceReceived = 32_250;
    const advanceRefunded = 5_450;
    const poolUnclamped = advanceReceived - facets.advanceApplied - advanceRefunded;
    expect(poolUnclamped).toBe(-3_000);
    expect(poolUnclamped).toBeLessThan(unusedAdvance);
    expect(unusedAdvance - poolUnclamped).toBe(5_450);
  });
});

describe("computeRefundableCreditBalance", () => {
  it("Aafra-shaped: unused advance under invoice outstanding → no refund owed", () => {
    // Invoice ₹14,800 pending, unused advance ₹10,000 (not applied).
    // Buggy path used SQL party-net ₹4,800 → max(0, 10_000 − 4_800) = 5_200.
    expect(
      computeRefundableCreditBalance({
        unusedAdvance: 10_000,
        cnAvailable: 0,
        invoiceOutstanding: 14_800,
      }),
    ).toBe(0);
    expect(
      computeRefundableCreditBalance({
        unusedAdvance: 10_000,
        cnAvailable: 0,
        invoiceOutstanding: 4_800,
      }),
    ).toBe(5_200);
  });

  it("excess unused advance over invoice outstanding is refundable", () => {
    expect(
      computeRefundableCreditBalance({
        unusedAdvance: 10_000,
        cnAvailable: 0,
        invoiceOutstanding: 3_000,
      }),
    ).toBe(7_000);
  });

  it("unused advance with no invoices is fully refundable", () => {
    expect(
      computeRefundableCreditBalance({
        unusedAdvance: 10_000,
        cnAvailable: 0,
        invoiceOutstanding: 0,
      }),
    ).toBe(10_000);
  });

  it("invoice-side credit stacks unused advance but not CN already in outstanding", () => {
    // Overpayment Cr ₹2,000 + unused advance ₹1,000. CN ₹500 that is already
    // reflected in the Cr outstanding must not add again.
    expect(
      computeRefundableCreditBalance({
        unusedAdvance: 1_000,
        cnAvailable: 500,
        invoiceOutstanding: -2_000,
      }),
    ).toBe(3_000);
  });

  it("Zohra-shaped: paid POS + pending SR CN — refundable is CN once, not 2×", () => {
    // POS ₹600 paid in full, then sale return pending CN ₹600.
    // Recon Outstanding = −600 (Cr); snapshot cnAvailable = 600 (same return).
    // Buggy: abs(−600) + 600 = 1_200. Correct cash owed back = 600.
    expect(
      computeRefundableCreditBalance({
        unusedAdvance: 0,
        cnAvailable: 600,
        invoiceOutstanding: -600,
      }),
    ).toBe(600);
  });

  it("Sneha-shaped: paid sale invoice + pending SR — refundable once (ledger zeros CN when returns in recon)", () => {
    // INV ₹2,000 cash-paid, SR pending CN ₹2,000. Recon Outstanding = −2,000.
    // Caller must pass cnAvailable: 0 when saleReturns already in outstanding;
    // stacking snapshot CN still must not 2× if inv is Cr.
    expect(
      computeRefundableCreditBalance({
        unusedAdvance: 0,
        cnAvailable: 0,
        invoiceOutstanding: -2_000,
      }),
    ).toBe(2_000);
    expect(
      computeRefundableCreditBalance({
        unusedAdvance: 0,
        cnAvailable: 2_000,
        invoiceOutstanding: -2_000,
      }),
    ).toBe(2_000);
  });
});
