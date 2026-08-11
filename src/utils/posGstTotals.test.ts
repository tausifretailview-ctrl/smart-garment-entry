import { describe, expect, it } from "vitest";
import {
  computePosBillGst,
  computePosFlatDiscount,
  posLineGstExtractFromInclusive,
  posLineGstFromTaxable,
} from "./posGstTotals";

describe("computePosFlatDiscount", () => {
  it("applies percent flat discount after sale-return adjust (MRP base)", () => {
    const { flatDiscountAmount, flatDiscountBase } = computePosFlatDiscount({
      mrpTotal: 10923,
      saleReturnAdjust: 4800,
      flatDiscountValue: 10,
      flatDiscountMode: "percent",
    });
    expect(flatDiscountBase).toBe(6123);
    expect(flatDiscountAmount).toBe(612.3);
    expect(10923 - 4800 - flatDiscountAmount).toBe(5510.7);
  });

  it("caps amount-mode flat discount at post-S/R base", () => {
    const { flatDiscountAmount } = computePosFlatDiscount({
      mrpTotal: 1000,
      saleReturnAdjust: 800,
      flatDiscountValue: 500,
      flatDiscountMode: "amount",
    });
    expect(flatDiscountAmount).toBe(200);
  });
});

describe("posLineGstExtractFromInclusive", () => {
  it("extracts ₹100 GST from inclusive ₹2,100 @5%", () => {
    expect(posLineGstExtractFromInclusive(2100, 5)).toBe(100);
    expect(posLineGstFromTaxable(2000, 5)).toBe(100);
  });
});

describe("computePosBillGst — inclusive extraction after discounts", () => {
  it("inclusive: one line ₹2,100 @5%, no discount → GST ₹100, taxable base line sum ₹2,100", () => {
    const r = computePosBillGst([{ netAmount: 2100, gstPer: 5 }], "inclusive", 0);
    expect(r.totalGst).toBe(100);
    expect(r.taxableSubtotal).toBe(2100);
  });

  it("inclusive: line discount already in net → GST from discounted amount", () => {
    // Pre-disc 2100, line disc 100 → net 2000 @5%
    const r = computePosBillGst([{ netAmount: 2000, gstPer: 5 }], "inclusive", 0);
    expect(r.totalGst).toBeCloseTo(95.24, 1); // 2000 - 2000/1.05
  });

  it("inclusive: flat ₹ allocates then extracts", () => {
    const r = computePosBillGst([{ netAmount: 2100, gstPer: 5 }], "inclusive", 105);
    // adjusted inclusive = 1995 → GST = 1995 - 1995/1.05
    const expected = posLineGstExtractFromInclusive(1995, 5);
    expect(r.totalGst).toBe(expected);
  });

  it("inclusive: multi-rate lines allocate flat proportionally", () => {
    const items = [
      { netAmount: 1050, gstPer: 5 },
      { netAmount: 1120, gstPer: 12 },
    ];
    const flat = 217; // 10% of 2170
    const r = computePosBillGst(items, "inclusive", flat);
    const share0 = (1050 / 2170) * flat;
    const share1 = (1120 / 2170) * flat;
    const adj0 = Math.round((1050 - share0) * 100) / 100;
    const adj1 = Math.round((1120 - share1) * 100) / 100;
    const expected =
      Math.round(
        (posLineGstExtractFromInclusive(adj0, 5) + posLineGstExtractFromInclusive(adj1, 12)) *
          100,
      ) / 100;
    expect(r.totalGst).toBe(expected);
  });

  it("exclusive: GST on post-flat taxable (unchanged)", () => {
    const r = computePosBillGst([{ netAmount: 2000, gstPer: 5 }], "exclusive", 0);
    expect(r.totalGst).toBe(100);
    const withFlat = computePosBillGst([{ netAmount: 2000, gstPer: 5 }], "exclusive", 200);
    expect(withFlat.totalGst).toBe(90);
  });

  it("no_gst always zero", () => {
    expect(computePosBillGst([{ netAmount: 2100, gstPer: 5 }], "no_gst", 0).totalGst).toBe(0);
  });
});
