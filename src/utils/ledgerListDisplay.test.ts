import { describe, expect, it } from "vitest";
import {
  clearRepeatedOrgSalesPaid,
  ledgerListSalesPaidDisplay,
  listHasRepeatedSalesPaid,
  looksLikePartyWindowOrgTotals,
  stripPartyWindowTotals,
} from "./ledgerListDisplay";

describe("ledgerListDisplay", () => {
  it("detects ELLA NOOR window totals leaking onto every row", () => {
    expect(looksLikePartyWindowOrgTotals(3_226_922, 1_822_504, 3_226_922, 1_822_504)).toBe(true);
    expect(looksLikePartyWindowOrgTotals(8_000, 0, 3_226_922, 1_822_504)).toBe(false);
  });

  it("strips party RPC window columns", () => {
    const cleaned = stripPartyWindowTotals({
      customer_id: "a",
      signed_balance: 8000,
      total_dr: 3_226_922,
      total_cr: 1_822_504,
      net_receivable: 1_404_418,
    });
    expect(cleaned).toEqual({ customer_id: "a", signed_balance: 8000 });
  });

  it("hides leaked sales/paid for display", () => {
    expect(ledgerListSalesPaidDisplay(3_226_922, 1_822_504, 3_226_922, 1_822_504)).toEqual({
      sales: null,
      paid: null,
    });
    expect(ledgerListSalesPaidDisplay(12_000, 4_000, 3_226_922, 1_822_504)).toEqual({
      sales: 12_000,
      paid: 4_000,
    });
  });

  it("clears identical org sales/paid on every list row", () => {
    const rows = [
      { id: "1", totalSales: 3_226_922, totalPaid: 1_822_504, balance: 8_000 },
      { id: "2", totalSales: 3_226_922, totalPaid: 1_822_504, balance: 0 },
      { id: "3", totalSales: 3_226_922, totalPaid: 1_822_504, balance: 150 },
    ];
    expect(listHasRepeatedSalesPaid(rows)).toBe(true);
    expect(clearRepeatedOrgSalesPaid(rows).map((r) => r.totalSales)).toEqual([0, 0, 0]);
    expect(clearRepeatedOrgSalesPaid(rows).map((r) => r.balance)).toEqual([8_000, 0, 150]);
  });
});
