import { describe, expect, it } from "vitest";
import { trendzoGstSummary } from "@/utils/trendzoThermalPayment";

describe("trendzoGstSummary", () => {
  it("returns null when the bill has no GST", () => {
    expect(trendzoGstSummary({ gstBreakdown: { cgst: 0, sgst: 0, igst: 0 }, taxableAmount: 2250 })).toBeNull();
    expect(trendzoGstSummary({})).toBeNull();
  });

  it("sums CGST + SGST and uses the passed taxable value", () => {
    expect(
      trendzoGstSummary({ gstBreakdown: { cgst: 53.57, sgst: 53.57 }, taxableAmount: 2142.86 }),
    ).toEqual({ taxable: 2142.86, cgst: 53.57, sgst: 53.57, igst: 0, total: 107.14 });
  });

  it("falls back to the rate breakdown taxable when no total is passed", () => {
    const s = trendzoGstSummary({
      gstBreakdown: { cgst: 0, sgst: 0, igst: 90 },
      gstRateBreakdown: [{ rate: 18, taxableAmount: 500, cgst: 0, sgst: 0, igst: 90, totalTax: 90 }],
    });
    expect(s?.taxable).toBe(500);
    expect(s?.total).toBe(90);
  });
});
