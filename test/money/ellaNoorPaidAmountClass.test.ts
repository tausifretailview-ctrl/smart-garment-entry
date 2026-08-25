import { describe, expect, it } from "vitest";

/**
 * Step 2 classification for “party trusts paid_amount over receipts”.
 * Mirrors scripts/ella-noor-customer-balance-audit-2026-08.sql Step 2-paid / 2-466 / 2c.
 * Do not fold paid_amount into the seven-component recompute.
 */

export const DRIFT_THRESHOLD = 1;

export function gapEqualsPaidAmount(
  gapRecomputeMinusParty: number,
  paidAmountSum: number,
  threshold = DRIFT_THRESHOLD,
): boolean {
  return Math.abs(gapRecomputeMinusParty - paidAmountSum) <= threshold;
}

/** Customer-level: paid_amount credited instead of (or on top of) GREATEST(paid, receipts). */
export function paidMinusReceipts(paidAmountSum: number, receiptPayments: number): number {
  return Math.max(0, paidAmountSum - receiptPayments);
}

export type PaidTrustKind = "full" | "inflation" | "partial" | "none";

/**
 * full      — same join as Step 1e: ABS(gap − paid_amount_sum) <= threshold
 * inflation — gap equals per-sale or customer-level paid-over-receipts inflation
 * partial   — inflation > threshold but does not cover the gap
 * none      — paid_amount does not explain the gap
 */
export function paidTrustKind(
  gapRecomputeMinusParty: number,
  paidAmountSum: number,
  receiptPayments: number,
  perSaleInflation: number,
  threshold = DRIFT_THRESHOLD,
): PaidTrustKind {
  if (gapEqualsPaidAmount(gapRecomputeMinusParty, paidAmountSum, threshold)) {
    return "full";
  }
  const customerInflation = paidMinusReceipts(paidAmountSum, receiptPayments);
  if (
    Math.abs(gapRecomputeMinusParty - customerInflation) <= threshold
    || Math.abs(gapRecomputeMinusParty - perSaleInflation) <= threshold
  ) {
    return "inflation";
  }
  const inflation = Math.max(customerInflation, perSaleInflation);
  if (inflation > threshold && inflation < gapRecomputeMinusParty - threshold) {
    return "partial";
  }
  return "none";
}

export function cohortOf(receiptPayments: number, totalInvoiced: number): "zero_receipt_invoiced" | "some_receipts" | "other_mismatch" {
  if (receiptPayments === 0 && totalInvoiced > 0.009) return "zero_receipt_invoiced";
  if (receiptPayments > 0.009) return "some_receipts";
  return "other_mismatch";
}

describe("ELLA NOOR party-trusts-paid_amount classification", () => {
  it("tags a zero-receipt customer when the gap equals SUM(paid_amount) (the 234)", () => {
    const gap = 12_500;
    const paidSum = 12_500;
    expect(gapEqualsPaidAmount(gap, paidSum)).toBe(true);
    expect(paidTrustKind(gap, paidSum, 0, paidSum)).toBe("full");
    expect(cohortOf(0, 12_500)).toBe("zero_receipt_invoiced");
  });

  it("does not tag the leftover 17 when paid_amount and the gap disagree", () => {
    expect(gapEqualsPaidAmount(8_000, 1_200)).toBe(false);
    expect(paidTrustKind(8_000, 1_200, 0, 1_200)).toBe("partial");
    expect(paidTrustKind(8_000, 0, 0, 0)).toBe("none");
  });

  it("treats credit_applied leftover as a different question — not this classifier", () => {
    const gap = 5_000;
    const paidSum = 100;
    const creditBeyondSra = 5_000;
    expect(gapEqualsPaidAmount(gap, paidSum)).toBe(false);
    expect(Math.abs(gap - creditBeyondSra) <= DRIFT_THRESHOLD).toBe(true);
  });

  it("on the 466 (some receipts), full 1e join is gap ≈ paid_amount_sum", () => {
    expect(cohortOf(3_000, 20_000)).toBe("some_receipts");
    expect(paidTrustKind(10_000, 10_000, 3_000, 7_000)).toBe("full");
  });

  it("explains a 466 row fully via inflation when party credits GREATEST(paid, receipts)", () => {
    const receipts = 3_000;
    const paidSum = 10_000;
    const gap = paidSum - receipts;
    expect(paidTrustKind(gap, paidSum, receipts, gap)).toBe("inflation");
    expect(gapEqualsPaidAmount(gap, paidSum)).toBe(false);
  });

  it("marks partial when paid_amount inflation covers some but not all of the gap", () => {
    expect(paidTrustKind(20_000, 8_000, 3_000, 5_000)).toBe("partial");
  });

  it("uses the rupee threshold of 1, same as Step 1e", () => {
    expect(gapEqualsPaidAmount(100.4, 100.0)).toBe(true);
    expect(gapEqualsPaidAmount(102, 100)).toBe(false);
  });
});
