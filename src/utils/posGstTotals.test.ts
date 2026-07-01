import { describe, expect, it } from "vitest";
import { computePosFlatDiscount } from "./posGstTotals";

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
