import { describe, expect, it } from "vitest";
import {
  ledgerBalanceCheck,
  ledgerHeadline,
  ledgerThreeLineSummary,
} from "./customerLedgerHeadline";

describe("ledgerHeadline", () => {
  it("uses plain words for each side", () => {
    expect(ledgerHeadline(600)).toMatchObject({ kind: "owes", amount: 600, label: "Customer owes you" });
    expect(ledgerHeadline(-3900)).toMatchObject({ kind: "credit", amount: 3900, label: "You owe customer" });
    expect(ledgerHeadline(0.3)).toMatchObject({ kind: "settled", amount: 0, label: "Settled" });
  });
});

describe("ledgerThreeLineSummary", () => {
  it("adds up to the table's last row (Afreen before cleanup)", () => {
    // Rows as printed on the 01-10-2026 ledger PDF.
    const rows = [
      { id: "i408", type: "invoice", balance: 4200 },
      { id: "p408", type: "payment", balance: 0 },
      { id: "sr47", type: "return", balance: -4200 },
      { id: "pay2130", type: "refund", balance: -3900 },
      { id: "sr49", type: "return", balance: -8100 },
      { id: "i464", type: "invoice", balance: -4200 },
      { id: "cn464", type: "cn_adjusted", balance: -4200 },
      { id: "pay2135", type: "refund", balance: -3900 },
    ];
    const s = ledgerThreeLineSummary(rows);
    expect(s).toMatchObject({ bills: 8100, paidCredited: 12600, refunds: 600, other: 0 });
    expect(s.opening + s.bills - s.paidCredited + s.refunds + s.other).toBe(s.balance);
    expect(s.balance).toBe(-3900);
  });

  it("keeps an opening balance separate", () => {
    const s = ledgerThreeLineSummary([
      { id: "opening-balance", type: "adjustment", balance: 1000 },
      { id: "i1", type: "invoice", balance: 1500 },
      { id: "p1", type: "payment", balance: 500 },
    ]);
    expect(s).toMatchObject({ opening: 1000, bills: 500, paidCredited: 1000, balance: 500 });
  });

  it("is zero for an empty ledger", () => {
    expect(ledgerThreeLineSummary([]).balance).toBe(0);
  });
});

describe("ledgerBalanceCheck", () => {
  it("flags a difference over ₹1", () => {
    expect(ledgerBalanceCheck({ tableBalance: -3900, checkBalance: 600 })).toMatchObject({
      needsChecking: true,
      difference: 4500,
    });
  });

  it("does not flag rounding or while the check loads", () => {
    expect(ledgerBalanceCheck({ tableBalance: 100, checkBalance: 100.4 }).needsChecking).toBe(false);
    expect(ledgerBalanceCheck({ tableBalance: 100, checkBalance: 900, checkLoading: true }).needsChecking).toBe(false);
    expect(ledgerBalanceCheck({ tableBalance: 100, checkBalance: null }).needsChecking).toBe(false);
  });
});
