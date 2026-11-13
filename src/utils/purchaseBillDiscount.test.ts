import { describe, expect, it } from "vitest";
import { purchaseBillDiscountFromPercent, purchaseBillDiscountPercent } from "./purchaseBillDiscount";

describe("purchase bill discount % ↔ ₹", () => {
  it("shows the ₹ discount as a percent of gross, blank when none", () => {
    expect(purchaseBillDiscountPercent(250, 10000)).toBe(2.5);
    expect(purchaseBillDiscountPercent(333.33, 10000)).toBe(3.33);
    expect(purchaseBillDiscountPercent(0, 10000)).toBe("");
    expect(purchaseBillDiscountPercent(100, 0)).toBe("");
  });
  it("turns a typed percent into rupees, rounded to paise", () => {
    expect(purchaseBillDiscountFromPercent(2.5, 10000)).toBe(250);
    expect(purchaseBillDiscountFromPercent(3.333, 9999)).toBe(333.27);
    expect(purchaseBillDiscountFromPercent(0, 10000)).toBe(0);
  });
});
