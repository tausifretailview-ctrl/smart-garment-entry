import { describe, expect, it } from "vitest";
import { canonicalOnHandQty } from "./canonicalOnHandQty";

describe("canonicalOnHandQty", () => {
  it("prefers stock_qty, including zero", () => {
    expect(canonicalOnHandQty({ stock_qty: 5, current_stock: 99 })).toBe(5);
    expect(canonicalOnHandQty({ stock_qty: 0, current_stock: 12 })).toBe(0);
    expect(canonicalOnHandQty({ stock_qty: "7", current_stock: 1 })).toBe(7);
  });

  it("falls back to current_stock only when stock_qty is null", () => {
    expect(canonicalOnHandQty({ stock_qty: null, current_stock: 4 })).toBe(4);
    expect(canonicalOnHandQty({ current_stock: 4 })).toBe(4);
    expect(canonicalOnHandQty({})).toBe(0);
  });
});
