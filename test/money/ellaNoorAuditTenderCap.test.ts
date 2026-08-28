import { describe, expect, it } from "vitest";

/**
 * Step 1 tender residual for the ELLA NOOR audit.
 * Mirrors live compute_sale_settlement: LEAST(net, GREATEST(receipts, tender)).
 * Do not SUM receipts + tender — that double-counts handleRecordPayment dual-write.
 */
function settlementWithTender(netAmount: number, receipts: number, tender: number): number {
  const cap = Math.max(0, netAmount);
  const r = Math.max(0, receipts);
  const t = Math.max(0, tender);
  return Math.min(cap, Math.max(r, t));
}

function paidAtSaleTenderResidual(netAmount: number, receipts: number, tender: number): number {
  const receiptsClamped = Math.max(0, receipts);
  return Math.max(0, settlementWithTender(netAmount, receiptsClamped, tender) - receiptsClamped);
}

describe("ELLA NOOR audit paid-at-sale tender cap", () => {
  it("credits tender when there are no receipts (the 247-row gap)", () => {
    expect(paidAtSaleTenderResidual(100_000, 0, 50_000)).toBe(50_000);
  });

  it("does not add tender when a matching receipt already covers it (dual-write)", () => {
    expect(paidAtSaleTenderResidual(100_000, 50_000, 50_000)).toBe(0);
    expect(settlementWithTender(100_000, 50_000, 50_000)).toBe(50_000);
  });

  it("does not SUM receipts and tender then cap — that would invent a second payment", () => {
    const net = 100_000;
    const receipts = 50_000;
    const tender = 50_000;
    const naiveSumThenCap = Math.min(net, receipts + tender);
    expect(naiveSumThenCap).toBe(100_000);
    expect(settlementWithTender(net, receipts, tender)).toBe(50_000);
  });

  it("caps at net_amount when tender exceeds the bill", () => {
    expect(settlementWithTender(1_000, 0, 1_500)).toBe(1_000);
    expect(paidAtSaleTenderResidual(1_000, 0, 1_500)).toBe(1_000);
  });

  it("uses the larger of receipts and tender when they differ, still capped", () => {
    expect(paidAtSaleTenderResidual(10_000, 2_000, 7_000)).toBe(5_000);
    expect(paidAtSaleTenderResidual(10_000, 7_000, 2_000)).toBe(0);
  });
});
