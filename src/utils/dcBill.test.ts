import { describe, expect, it } from "vitest";
import { isAllDcCart, isMissingDcNumberFunction } from "./dcBill";

describe("dcBill", () => {
  it("gives the DC series only when every line is a DC item", () => {
    expect(isAllDcCart([{ isDcProduct: true }, { isDcProduct: true }])).toBe(true);
    expect(isAllDcCart([{ isDcProduct: true }, { isDcProduct: false }])).toBe(false);
    expect(isAllDcCart([{ isDcProduct: true }, {}])).toBe(false);
    expect(isAllDcCart([])).toBe(false);
    expect(isAllDcCart(null)).toBe(false);
  });

  it("falls back to the POS series only when the DC number function is missing", () => {
    expect(isMissingDcNumberFunction({ code: "PGRST202", message: "Could not find the function" })).toBe(true);
    expect(
      isMissingDcNumberFunction({ message: "function public.generate_dc_number_atomic(uuid) does not exist" }),
    ).toBe(true);
    expect(isMissingDcNumberFunction({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(isMissingDcNumberFunction(null)).toBe(false);
  });
});
