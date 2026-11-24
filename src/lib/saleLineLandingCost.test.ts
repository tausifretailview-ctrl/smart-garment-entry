import { describe, expect, it } from "vitest";
import { landingCostFromPurchase } from "./saleLineLandingCost";
import { computePurchaseBillTotals } from "@/utils/excelImportUtils";

describe("landingCostFromPurchase", () => {
  it("plain line: rate, rate + GST", () => {
    const line = { pur_price: 500, qty: 10, line_total: 5000, gst_per: 5 };
    const bill = { gross_amount: 5000, discount_amount: 0, other_charges: 0, round_off: 0 };
    expect(landingCostFromPurchase(line, bill, 5000)).toEqual({
      purchaseRate: 500,
      landingWithoutGst: 500,
      landingWithGst: 525,
    });
  });

  it("shares bill discount, other charges and round-off by line value, like the bill total", () => {
    // Two lines: A 10 × 500 (5% GST), B 4 × 750 (12% GST). Bill discount 400, freight 280.
    const lines = [
      { line_total: 5000, gst_per: 5, qty: 10, pur_price: 500, discount_percent: 0 },
      { line_total: 3000, gst_per: 12, qty: 4, pur_price: 750, discount_percent: 0 },
    ];
    const totals = computePurchaseBillTotals(lines, 400, 280, false);
    const bill = {
      gross_amount: totals.grossBeforeDiscount,
      discount_amount: totals.itemDiscount + 400,
      other_charges: 280,
      round_off: totals.roundOff,
    };
    const a = landingCostFromPurchase(lines[0], bill, 8000)!;
    const b = landingCostFromPurchase(lines[1], bill, 8000)!;
    // A: 5000 − 250 = 4750; GST 237.50; charges (280 + round-off) × 5/8.
    expect(a.landingWithoutGst).toBeCloseTo((4750 + (280 + totals.roundOff) * 0.625) / 10, 2);
    expect(a.landingWithGst).toBeCloseTo((4750 + 237.5 + (280 + totals.roundOff) * 0.625) / 10, 2);
    // Every line's landing cost × qty adds back up to the bill's net amount.
    expect(a.landingWithGst * 10 + b.landingWithGst * 4).toBeCloseTo(totals.netAmount, 1);
  });

  it("DC purchase: no GST", () => {
    const line = { pur_price: 200, qty: 5, line_total: 1000, gst_per: 5 };
    const bill = { gross_amount: 1000, discount_amount: 0, other_charges: 50, round_off: 0, is_dc_purchase: true };
    expect(landingCostFromPurchase(line, bill, 1000)).toEqual({ purchaseRate: 200, landingWithoutGst: 210, landingWithGst: 210 });
  });

  it("line discount is already in line_total", () => {
    const line = { pur_price: 1000, qty: 2, line_total: 1800, gst_per: 0 };
    const bill = { gross_amount: 2000, discount_amount: 200, other_charges: 0, round_off: 0 };
    expect(landingCostFromPurchase(line, bill, 1800)).toEqual({ purchaseRate: 1000, landingWithoutGst: 900, landingWithGst: 900 });
  });

  it("no quantity or value: null", () => {
    const bill = { gross_amount: 0, discount_amount: 0, other_charges: 0, round_off: 0 };
    expect(landingCostFromPurchase({ pur_price: 10, qty: 0, line_total: 0, gst_per: 5 }, bill, 0)).toBeNull();
  });
});
