import { describe, expect, it } from "vitest";
import {
  buildAccountTallyData,
  computeClosingCash,
  denominationTotal,
  emptyDenominationCounts,
  openingFromPreviousClose,
  parseAccountTallyData,
  tallyDifferenceStatus,
  type AccountTallyMeta,
} from "@/utils/accountTally";

const meta: AccountTallyMeta = {
  version: 1,
  cashSale: 1000,
  cardSale: 500,
  upiSale: 700,
  bankSale: 0,
  creditSale: 0,
  totalSale: 2200,
  cashIn: 1000,
  cashOut: 100,
  expectedCard: 500,
  expectedUpi: 700,
  actualCard: 500,
  actualUpi: null,
  shortReason: "",
  handoverTo: "Owner",
  closedBy: "cashier@shop",
  closedAt: "2026-10-30T20:00:00.000Z",
};

describe("accountTally", () => {
  it("totals notes and coins", () => {
    const counts = { ...emptyDenominationCounts(), 500: 3, 100: 2, 10: 4 };
    expect(denominationTotal(counts, 7)).toBe(1747);
  });

  it("reads the Daily Tally string shape", () => {
    const parsed = parseAccountTallyData(JSON.stringify({ counts: { 500: 2, 2000: 1 }, coins: 5, total: 3005 }));
    expect(parsed.counts[500]).toBe(2);
    expect(parsed.counts[2000]).toBe(1);
    expect(parsed.coins).toBe(5);
    expect(parsed.meta).toBeNull();
  });

  it("reads the POS pop-up shape", () => {
    const parsed = parseAccountTallyData({ denomCounts: { 200: 4 }, coinsBulk: 3 });
    expect(parsed.counts[200]).toBe(4);
    expect(parsed.counts[10]).toBe(0);
    expect(parsed.coins).toBe(3);
  });

  it("round-trips the saved Account Tally shape for all readers", () => {
    const counts = { ...emptyDenominationCounts(), 500: 1 };
    const saved = buildAccountTallyData(counts, 2, meta);
    expect(saved.total).toBe(502);
    expect(saved.denomCounts).toBe(counts);
    expect(saved.coinsBulk).toBe(2);
    const parsed = parseAccountTallyData(saved);
    expect(parsed.meta?.handoverTo).toBe("Owner");
    expect(parsed.counts[500]).toBe(1);
  });

  it("splits counted cash into owner, bank and closing drawer", () => {
    expect(computeClosingCash(12500, 8000, 2500)).toBe(2000);
    expect(computeClosingCash(1000, 1500, 0)).toBe(-500);
  });

  it("flags short / excess beyond one rupee", () => {
    expect(tallyDifferenceStatus(0.4)).toBe("balanced");
    expect(tallyDifferenceStatus(-50)).toBe("short");
    expect(tallyDifferenceStatus(20)).toBe("excess");
  });

  it("carries the last closing into the next opening", () => {
    expect(openingFromPreviousClose({ leave_in_drawer: 2000 })).toBe(2000);
    expect(openingFromPreviousClose(null)).toBe(0);
  });
});
