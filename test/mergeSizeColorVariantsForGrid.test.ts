import { describe, expect, it } from "vitest";
import { mergeSizeColorVariantsForGrid } from "../src/utils/mergeSizeColorVariantsForGrid";

describe("mergeSizeColorVariantsForGrid", () => {
  it("sums stock for duplicate size+color rows", () => {
    const merged = mergeSizeColorVariantsForGrid([
      { id: "a", size: "4", color: "BK", stock_qty: 19, sale_price: 100 },
      { id: "b", size: "4", color: "BK", stock_qty: 5, sale_price: 120 },
      { id: "c", size: "3", color: "BK", stock_qty: 6, sale_price: 100 },
      { id: "d", size: "3", color: "BK", stock_qty: 1, sale_price: 100 },
    ]);

    const bySize = Object.fromEntries(merged.map((v) => [v.size, v]));
    expect(bySize["4"].stock_qty).toBe(24);
    expect(bySize["3"].stock_qty).toBe(7);
  });

  it("prefers variant matching selected sale price as representative", () => {
    const merged = mergeSizeColorVariantsForGrid(
      [
        { id: "cheap", size: "4", color: "BK", stock_qty: 19, sale_price: 100 },
        { id: "priced", size: "4", color: "BK", stock_qty: 5, sale_price: 120 },
      ],
      { selectedSalePrice: 120 },
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe("priced");
    expect(merged[0].stock_qty).toBe(24);
  });

  it("subtracts cart qty across all variants in the size+color group", () => {
    const cart = new Map<string, number>([
      ["a", 2],
      ["b", 3],
    ]);
    const merged = mergeSizeColorVariantsForGrid(
      [
        { id: "a", size: "4", color: "BK", stock_qty: 10 },
        { id: "b", size: "4", color: "BK", stock_qty: 8 },
      ],
      { cartQtyByVariant: cart },
    );

    expect(merged[0].stock_qty).toBe(13);
  });
});
