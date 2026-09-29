import { describe, expect, it } from "vitest";
import { quickSaleLineDiscount } from "./lookupBarcodeSales";

describe("quickSaleLineDiscount", () => {
  it("shows a percent discount and its rupee amount", () => {
    expect(
      quickSaleLineDiscount({
        unit_price: 400,
        quantity: 1,
        discount_percent: 10,
        line_total: 360,
      }),
    ).toEqual({ percent: 10, amount: 40 });
  });

  it("shows a rupee line discount when no percent was stored", () => {
    expect(
      quickSaleLineDiscount({
        unit_price: 500,
        quantity: 1,
        discount_percent: 0,
        line_total: 450,
        discount_share: 0,
      }),
    ).toEqual({ percent: 0, amount: 50 });
  });

  it("does not treat the bill flat discount share as an item discount", () => {
    expect(
      quickSaleLineDiscount({
        unit_price: 500,
        quantity: 1,
        discount_percent: 0,
        line_total: 450,
        discount_share: 50,
      }),
    ).toEqual({ percent: 0, amount: 0 });
  });

  it("is empty when the line was sold at full price", () => {
    expect(
      quickSaleLineDiscount({
        unit_price: 200,
        quantity: 1,
        discount_percent: 0,
        line_total: 200,
      }),
    ).toEqual({ percent: 0, amount: 0 });
  });
});
