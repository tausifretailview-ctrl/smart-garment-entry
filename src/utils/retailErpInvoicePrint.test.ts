import { describe, expect, it } from "vitest";
import {
  retailErpDisplayDiscount,
  retailErpLineDisplayRate,
  retailErpLineGross,
} from "./retailErpInvoicePrint";

describe("Gurukrupa A5 billed unit rate (POS unit-price edit)", () => {
  /** POS/26-27/1892: qty 2, edited unit ₹2,750, master/MRP ₹4,000, net ₹5,500. */
  const line = { mrp: 4_000, rate: 2_750, qty: 2, total: 5_500 };

  it("prints the edited unit price in Rate, not the old sale price / MRP", () => {
    expect(retailErpLineDisplayRate(line, true)).toBe(2_750);
    expect(retailErpLineGross(line, true)).toBe(5_500);
  });

  it("does not reprint the MRP−unit gap as Discount when Rate is the billed unit", () => {
    const subTotal = retailErpLineGross(line, true);
    const merchandiseNet = 5_500;
    const computed = Math.max(0, subTotal - merchandiseNet);
    expect(
      retailErpDisplayDiscount({
        billedUnitRate: true,
        propDiscount: 2_500,
        computedFromLines: computed,
      }),
    ).toBe(0);
  });

  it("standard Retail ERP still shows list/MRP in Rate and the gap as Discount", () => {
    expect(retailErpLineDisplayRate(line, false)).toBe(4_000);
    expect(retailErpLineGross(line, false)).toBe(8_000);
    expect(
      retailErpDisplayDiscount({
        billedUnitRate: false,
        propDiscount: 2_500,
        computedFromLines: 2_500,
      }),
    ).toBe(2_500);
  });

  it("keeps an explicit bill discount (flat / Disc%) under billed unit rates", () => {
    expect(
      retailErpDisplayDiscount({
        billedUnitRate: true,
        propDiscount: 500,
        computedFromLines: 500,
      }),
    ).toBe(500);
  });
});
