import { describe, expect, it } from "vitest";
import { inferPurchaseLineDiscount } from "./inferPurchaseLineDiscount";

describe("inferPurchaseLineDiscount", () => {
  it("is zero when line_total matches qty × price", () => {
    expect(
      inferPurchaseLineDiscount({
        purchasedQty: 10,
        returnQty: 4,
        purPrice: 100,
        storedLineTotal: 1000,
      }),
    ).toEqual({
      discount_percent: 0,
      discount_amount: 0,
      line_total: 400,
    });
  });

  it("scales stored line discount to the return qty", () => {
    const got = inferPurchaseLineDiscount({
      purchasedQty: 10,
      returnQty: 5,
      purPrice: 100,
      storedLineTotal: 900,
    });
    expect(got.discount_percent).toBeCloseTo(10, 8);
    expect(got.discount_amount).toBeCloseTo(50, 8);
    expect(got.line_total).toBeCloseTo(450, 8);
  });

  it("does not invent discount when stored total is slightly over base", () => {
    expect(
      inferPurchaseLineDiscount({
        purchasedQty: 1,
        returnQty: 1,
        purPrice: 100,
        storedLineTotal: 100.002,
      }).discount_amount,
    ).toBe(0);
  });
});
