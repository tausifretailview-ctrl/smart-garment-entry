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

export type NamedPattern =
  | "party_trusts_paid_amount"
  | "duplicate_receipt"
  | "cn_double_count"
  | "legacy_paid_baseline"
  | "manual_adjustment_overlay"
  | "advance_over_application"
  | "unrecorded_refund"
  | "orphan_receipt"
  | "off_cause_unclear";

export type QueueTier = "P0" | "P1" | "P2";

/** Step 5 tiers: P0 |party|≥1e5 or |gap|≥5e4; P1 named and (|party|≥5e3 or |gap|≥5e3); else P2. */
export function queueTier(absPartySigned: number, absGap: number, namedPattern: NamedPattern): QueueTier {
  if (absPartySigned >= 100_000 || absGap >= 50_000) return "P0";
  const named = namedPattern !== "off_cause_unclear";
  if (named && (absPartySigned >= 5_000 || absGap >= 5_000)) return "P1";
  return "P2";
}

export function namedPatternOf(
  kind: PaidTrustKind,
  otherNamedClass: Exclude<NamedPattern, "party_trusts_paid_amount">,
): NamedPattern {
  if (kind === "full" || kind === "inflation" || kind === "partial") return "party_trusts_paid_amount";
  return otherNamedClass;
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

describe("ELLA NOOR Step 5 queue tiers", () => {
  it("P0 when |party| ≥ 1,00,000 even if the gap is smaller", () => {
    expect(queueTier(473_730, 20_000, "party_trusts_paid_amount")).toBe("P0");
  });

  it("P0 when |gap| ≥ 50,000 even if |party| is under 1L", () => {
    expect(queueTier(12_000, 50_000, "party_trusts_paid_amount")).toBe("P0");
    expect(queueTier(0, 50_000, "off_cause_unclear")).toBe("P0");
  });

  it("P1 for a named pattern at the ₹5,000 floor", () => {
    expect(queueTier(5_000, 100, "party_trusts_paid_amount")).toBe("P1");
    expect(queueTier(100, 5_000, "duplicate_receipt")).toBe("P1");
  });

  it("P2 for a named pattern under ₹5,000 and a small unexplained gap", () => {
    expect(queueTier(2_000, 2_000, "party_trusts_paid_amount")).toBe("P2");
    expect(queueTier(8_000, 8_000, "off_cause_unclear")).toBe("P2");
  });

  it("does not promote unexplained customers to P1 just because the gap is ₹5,000+", () => {
    expect(queueTier(9_000, 9_000, "off_cause_unclear")).toBe("P2");
  });

  it("maps paid_trust_kind onto party_trusts_paid_amount before other named classes", () => {
    expect(namedPatternOf("full", "duplicate_receipt")).toBe("party_trusts_paid_amount");
    expect(namedPatternOf("none", "legacy_paid_baseline")).toBe("legacy_paid_baseline");
    expect(namedPatternOf("none", "off_cause_unclear")).toBe("off_cause_unclear");
  });
});
