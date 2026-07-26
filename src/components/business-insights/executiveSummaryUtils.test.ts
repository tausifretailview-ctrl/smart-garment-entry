import { describe, expect, it } from "vitest";
import {
  computePareto,
  pctChange,
  periodLengthDays,
  previousPeriod,
} from "./executiveSummaryUtils";

describe("executiveSummaryUtils", () => {
  it("computes inclusive period length and prior window for 01/04/2026–26/07/2026", () => {
    const range = { startDate: "2026-04-01", endDate: "2026-07-26" };
    expect(periodLengthDays(range)).toBe(117);
    expect(previousPeriod(range)).toEqual({
      startDate: "2025-12-05",
      endDate: "2026-03-31",
    });
  });

  it("returns null pctChange for zero prior or non-finite values", () => {
    expect(pctChange(100, 0)).toBeNull();
    expect(pctChange(Number.NaN, 10)).toBeNull();
    expect(pctChange(120, 100)).toBeCloseTo(20);
  });

  it("handles empty / zero / negative profit rows in Pareto", () => {
    expect(computePareto([])).toEqual({
      skusFor80PctProfit: 0,
      totalProfitableSkus: 0,
      top20PctProfitShare: 0,
      concentrationLabel: "Widely spread",
    });
    expect(computePareto([{ gross_profit: 0 }, { gross_profit: -40 }])).toEqual({
      skusFor80PctProfit: 0,
      totalProfitableSkus: 0,
      top20PctProfitShare: 0,
      concentrationLabel: "Widely spread",
    });

    const result = computePareto([
      { gross_profit: 100 },
      { gross_profit: 50 },
      { gross_profit: 30 },
      { gross_profit: 20 },
      { gross_profit: -10 },
    ]);
    expect(result.totalProfitableSkus).toBe(4);
    expect(result.skusFor80PctProfit).toBeGreaterThan(0);
    expect(result.top20PctProfitShare).toBeGreaterThan(0);
  });
});
