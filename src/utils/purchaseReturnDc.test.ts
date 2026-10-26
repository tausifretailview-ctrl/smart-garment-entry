import { describe, expect, it } from "vitest";
import { derivePurchaseReturnLineDiscount } from "./purchaseReturnDc";

describe("derivePurchaseReturnLineDiscount", () => {
  it("returns zero when line_total equals qty × rate", () => {
    expect(derivePurchaseReturnLineDiscount({ qty: 2, pur_price: 1295, line_total: 2590 })).toEqual({
      discount_amount: 0,
      discount_percent: 0,
    });
  });

  it("recovers the saved line discount from line_total", () => {
    expect(derivePurchaseReturnLineDiscount({ qty: 2, pur_price: 1000, line_total: 1800 })).toEqual({
      discount_amount: 200,
      discount_percent: 10,
    });
  });

  it("ignores paise rounding noise", () => {
    expect(derivePurchaseReturnLineDiscount({ qty: 1, pur_price: 99.99, line_total: 99.987 }).discount_amount).toBe(0);
  });
});
