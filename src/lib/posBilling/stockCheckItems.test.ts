import { describe, expect, it } from "vitest";
import { posCartItemsForStockCheck } from "./stockCheckItems";

describe("posCartItemsForStockCheck", () => {
  it("sends variant, qty, name and size of every line, in cart order", () => {
    const lines = [
      { id: "a", variantId: "v1", quantity: 2, productName: "Shirt", size: "M", netAmount: 1998 },
      { id: "b", variantId: "v1", quantity: 1, productName: "Shirt", size: "M", netAmount: 999 },
      { id: "c", variantId: "v2", quantity: 0.5, productName: "Cloth", size: "MTR", netAmount: 120 },
    ];
    expect(posCartItemsForStockCheck(lines)).toEqual([
      { variantId: "v1", quantity: 2, productName: "Shirt", size: "M" },
      { variantId: "v1", quantity: 1, productName: "Shirt", size: "M" },
      { variantId: "v2", quantity: 0.5, productName: "Cloth", size: "MTR" },
    ]);
  });
});
