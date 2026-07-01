import { describe, expect, it } from "vitest";
import { getSaleReportGrossAmount } from "./cashierReportUtils";

describe("getSaleReportGrossAmount", () => {
  it("uses gross_amount when present", () => {
    expect(getSaleReportGrossAmount({ gross_amount: 1000, net_amount: 950 })).toBe(1000);
  });

  it("falls back to net_amount when gross is zero (rate-only / MRP-missing DC)", () => {
    expect(getSaleReportGrossAmount({ gross_amount: 0, net_amount: 750 })).toBe(750);
  });

  it("returns 0 when both are zero", () => {
    expect(getSaleReportGrossAmount({ gross_amount: 0, net_amount: 0 })).toBe(0);
  });
});
