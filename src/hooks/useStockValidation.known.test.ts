/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { stockCheckFromKnown } from "./useStockValidation";

/**
 * A barcode scan reads the item, stock included, and adds it at once. The add-to-cart stock
 * check uses that figure instead of reading the same row again (speed review item L4). The
 * answer must be the one the second read gave.
 */
const shirt = { stockQty: 3, productName: "COTTON SHIRT", size: "M", productType: "goods" };

describe("stockCheckFromKnown", () => {
  it("enough stock", () => {
    expect(stockCheckFromKnown(shirt, 3)).toEqual({ isAvailable: true, availableStock: 3, productName: "COTTON SHIRT", size: "M" });
  });

  it("not enough stock: reports what is available", () => {
    expect(stockCheckFromKnown(shirt, 4)).toEqual({ isAvailable: false, availableStock: 3, productName: "COTTON SHIRT", size: "M" });
    expect(stockCheckFromKnown({ ...shirt, stockQty: 0 }, 1).isAvailable).toBe(false);
  });

  it("editing a saved bill: the quantity that bill already holds is free to use", () => {
    expect(stockCheckFromKnown({ ...shirt, stockQty: 0 }, 2, 2)).toMatchObject({ isAvailable: true, availableStock: 2 });
    expect(stockCheckFromKnown({ ...shirt, stockQty: 1 }, 4, 2)).toMatchObject({ isAvailable: false, availableStock: 3 });
  });

  it("services and combos are never short", () => {
    expect(stockCheckFromKnown({ ...shirt, stockQty: 0, productType: "service" }, 50)).toMatchObject({ isAvailable: true, availableStock: 999999 });
    expect(stockCheckFromKnown({ ...shirt, stockQty: 0, productType: "combo" }, 50).isAvailable).toBe(true);
  });

  it("missing figures are read as zero stock of a goods item", () => {
    expect(stockCheckFromKnown({ stockQty: Number.NaN, productName: "", size: "", productType: null }, 1)).toEqual({
      isAvailable: false,
      availableStock: 0,
      productName: "Product",
      size: "",
    });
  });
});
