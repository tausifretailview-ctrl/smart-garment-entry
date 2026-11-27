import { describe, expect, it } from "vitest";
import {
  computeKrunalLines,
  estimateKrunalRowMm,
  krunalAmountInWords,
  krunalItemDescription,
  krunalStateLabel,
} from "./krunalA4Invoice";

const MH = "27AASFK1050A1ZO";
const GJ = "24ABCDE1234F1Z5";

describe("Krunal A4 line columns", () => {
  it("matches the KRUNAL sample line: 4 × 1595, 43% off, IGST 5% = 3818.43", () => {
    // Sale exclusive bill: the line total holds GST (taxable 3636.60 + 181.83).
    const { lines, isInterState } = computeKrunalLines(
      [{ particulars: "KIDZELLO 1881", size: "12-30", color: "OLIVE", hsn: "620319", qty: 4, rate: 1595, total: 3818.43, gstPercent: 5, discountPercent: 43 }],
      { taxType: "exclusive", grandTotal: 3818.43, sellerGstin: MH, buyerGstin: GJ },
    );
    expect(isInterState).toBe(true);
    expect(lines[0]).toMatchObject({
      description: "KIDZELLO 1881 (12-30) OLIVE",
      basicRate: 1595,
      gross: 6380,
      discPct: 43,
      discAmt: 2743.4,
      taxable: 3636.6,
      taxPct: 5,
      taxAmt: 181.83,
      amount: 3818.43,
      unit: "Pcs",
    });
  });

  it("inclusive bill: the rate is taken out of GST for Basic Rate", () => {
    // ₹1,050 incl. 5% → basic 1000; 10% off → taxable 900, GST 45, amount 945.
    const { lines, totals } = computeKrunalLines(
      [{ particulars: "SHIRT", qty: 1, rate: 1050, total: 945, gstPercent: 5, discountPercent: 10 }],
      { taxType: "inclusive", grandTotal: 945, sellerGstin: MH, buyerGstin: MH },
    );
    expect(lines[0]).toMatchObject({ basicRate: 1000, gross: 1000, discAmt: 100, taxable: 900, taxAmt: 45, amount: 945 });
    expect(totals).toMatchObject({ gross: 1000, lineDiscount: 100, taxable: 900, tax: 45, amount: 945, qty: 1 });
  });

  it("no discount and no-GST bills: discount 0, never negative", () => {
    const { lines } = computeKrunalLines(
      [
        { particulars: "CAP", qty: 2, rate: 100, total: 200, gstPercent: 0 },
        { particulars: "BELT", qty: 1, rate: 0, total: 150, gstPercent: 0 },
      ],
      { taxType: "no_gst", grandTotal: 350 },
    );
    expect(lines[0]).toMatchObject({ gross: 200, discAmt: 0, discPct: 0, amount: 200 });
    expect(lines[1]).toMatchObject({ gross: 150, discAmt: 0, basicRate: 150 });
  });
});

describe("Krunal A4 text", () => {
  it("adds size and colour once", () => {
    expect(krunalItemDescription({ particulars: "KIDZELLO 1881", size: "12-30", color: "OLIVE" })).toBe("KIDZELLO 1881 (12-30) OLIVE");
    expect(krunalItemDescription({ particulars: "KIDZELLO 1881 (12-30) OLIVE", size: "12-30", color: "OLIVE" })).toBe("KIDZELLO 1881 (12-30) OLIVE");
    expect(krunalItemDescription({ particulars: "TEE", size: "Free" })).toBe("TEE");
  });

  it("state from GSTIN", () => {
    expect(krunalStateLabel(MH)).toMatch(/^Maharashtra \[27\]$/i);
    expect(krunalStateLabel("")).toBe("");
  });

  it("amount in words (Indian system)", () => {
    expect(krunalAmountInWords(98417)).toBe("RUPEES NINETY EIGHT THOUSAND FOUR HUNDRED SEVENTEEN ONLY");
    expect(krunalAmountInWords(164440.5)).toBe("RUPEES ONE LAKH SIXTY FOUR THOUSAND FOUR HUNDRED FORTY AND FIFTY PAISE ONLY");
    expect(krunalAmountInWords(0)).toBe("RUPEES ZERO ONLY");
  });

  it("longer descriptions take more row height", () => {
    expect(estimateKrunalRowMm("SHORT")).toBeCloseTo(5.2);
    expect(estimateKrunalRowMm("X".repeat(70))).toBeGreaterThan(estimateKrunalRowMm("X".repeat(30)));
  });
});
