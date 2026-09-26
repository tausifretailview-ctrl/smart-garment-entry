import { describe, expect, it } from "vitest";
import {
  buildSizeGridColorByProduct,
  mergeSizeColorVariantsForGrid,
} from "./mergeSizeColorVariantsForGrid";

const sizes = ["6", "7", "8"];
const cml = { id: "p-cml", product_name: "0667109 WOMENS CML", color: "CML" };
const khkNoColor = { id: "p-khk", product_name: "0667109 WOMENS KHK", color: null };

function variantsFor(productId: string, color: string | null) {
  return sizes.map((size) => ({
    id: `${productId}-${size}`,
    product_id: productId,
    size,
    color,
    sale_price: 1595,
    mrp: 1595,
    stock_qty: 1,
  }));
}

describe("mergeSizeColorVariantsForGrid across products", () => {
  it("keeps a second product's variants under its own colour, not the first product's", () => {
    const merged = mergeSizeColorVariantsForGrid(
      [...variantsFor("p-cml", "CML"), ...variantsFor("p-khk", null)],
      { defaultColor: "CML", products: [cml, { ...khkNoColor, color: "KHK" }] },
    );
    expect(merged.filter((v) => v.color === "CML")).toHaveLength(3);
    const khk = merged.filter((v) => v.color === "KHK");
    expect(khk).toHaveLength(3);
    expect(khk.every((v) => v.product_id === "p-khk")).toBe(true);
    expect(khk[0].product_name).toBe("0667109 WOMENS KHK");
  });

  it("falls back to the differing part of the product name when products.color is blank", () => {
    const merged = mergeSizeColorVariantsForGrid(
      [...variantsFor("p-cml", null), ...variantsFor("p-khk", null)],
      { defaultColor: "", products: [{ ...cml, color: null }, khkNoColor] },
    );
    expect(new Set(merged.map((v) => v.color))).toEqual(new Set(["CML", "KHK"]));
    expect(merged).toHaveLength(6);
  });

  it("still merges same-name MRP duplicates with no colour into one row per size", () => {
    const a = { id: "a", product_name: "SHIRT 101", color: null };
    const b = { id: "b", product_name: "SHIRT 101", color: null };
    expect(buildSizeGridColorByProduct([a, b]).size).toBe(0);
    const merged = mergeSizeColorVariantsForGrid(
      [...variantsFor("a", null), ...variantsFor("b", null)],
      { products: [a, b] },
    );
    expect(merged).toHaveLength(3);
    expect(merged.every((v) => v.color === "" && v.stock_qty === 2)).toBe(true);
  });

  it("is unchanged for a single product without the products option", () => {
    const merged = mergeSizeColorVariantsForGrid(variantsFor("p-cml", null), { defaultColor: "CML" });
    expect(merged.every((v) => v.color === "CML")).toBe(true);
  });
});
