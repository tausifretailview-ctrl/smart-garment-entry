import { describe, expect, it } from "vitest";
import {
  filterPosQuickPriceCodeRows,
  parsePosQuickPriceCode,
  POS_QUICK_PRICE_NAME_PRODUCT_LIMIT,
  POS_QUICK_PRICE_VARIANT_LIMIT,
  posProductNameMatchesQuickLetters,
  posQuickPricePostgrestOr,
  posQuickPriceRupees,
  posQuickPriceRupeeWindow,
  posVariantMatchesQuickPrice,
} from "./posQuickPriceCode";

describe("parsePosQuickPriceCode", () => {
  it("parses first letter + rupee price (J300 -> Jeans at 300)", () => {
    expect(parsePosQuickPriceCode("J300")).toEqual({ letters: "j", price: 300 });
    expect(parsePosQuickPriceCode("j300")).toEqual({ letters: "j", price: 300 });
    expect(parsePosQuickPriceCode("S200")).toEqual({ letters: "s", price: 200 });
  });

  it("allows a space between letters and price", () => {
    expect(parsePosQuickPriceCode("J 300")).toEqual({ letters: "j", price: 300 });
  });

  it("allows up to 6 name letters (SHIRT200)", () => {
    expect(parsePosQuickPriceCode("SHIRT200")).toEqual({ letters: "shirt", price: 200 });
  });

  it("rejects barcodes, single-digit prices, and letter-only terms", () => {
    expect(parsePosQuickPriceCode("300")).toBeNull();
    expect(parsePosQuickPriceCode("J3")).toBeNull();
    expect(parsePosQuickPriceCode("J")).toBeNull();
    expect(parsePosQuickPriceCode("10001009")).toBeNull();
    expect(parsePosQuickPriceCode("")).toBeNull();
  });
});

describe("quick price row match", () => {
  it("matches product name prefix case-insensitively", () => {
    expect(posProductNameMatchesQuickLetters("JEANS", "j")).toBe(true);
    expect(posProductNameMatchesQuickLetters("  jeans", "J")).toBe(true);
    expect(posProductNameMatchesQuickLetters("Shirt", "j")).toBe(false);
  });

  it("treats 300.00 sale_price as ₹300", () => {
    expect(posQuickPriceRupees(300.00)).toBe(300);
    expect(posVariantMatchesQuickPrice({ sale_price: 300.0, mrp: 0 }, 300)).toBe(true);
  });

  it("matches MRP when sale_price is empty (POS billed from MRP)", () => {
    expect(posVariantMatchesQuickPrice({ sale_price: 0, mrp: 300 }, 300)).toBe(true);
    expect(posVariantMatchesQuickPrice({ sale_price: 199, mrp: 399 }, 300)).toBe(false);
  });

  it("does not match last-purchase sale price", () => {
    expect(
      posVariantMatchesQuickPrice(
        { sale_price: 0, mrp: 0, last_purchase_sale_price: 300 } as {
          sale_price: number;
          mrp: number;
          last_purchase_sale_price: number;
        },
        300,
      ),
    ).toBe(false);
  });

  it("builds a PostgREST or-filter on sale_price and mrp (not last purchase)", () => {
    const filter = posQuickPricePostgrestOr(300);
    expect(filter).toContain("sale_price.gte.");
    expect(filter).toContain("mrp.gte.");
    expect(filter).not.toContain("last_purchase");
  });

  it("includes half-rupee costs that Math.round maps to the typed price", () => {
    expect(posQuickPriceRupees(299.5)).toBe(300);
    expect(posQuickPriceRupees(300.5)).toBe(301);
    expect(posVariantMatchesQuickPrice({ sale_price: 299.5, mrp: 0 }, 300)).toBe(true);
    expect(posVariantMatchesQuickPrice({ sale_price: 300.5, mrp: 0 }, 300)).toBe(false);
    const { lo, hi } = posQuickPriceRupeeWindow(300);
    expect(lo).toBe(299.5);
    expect(hi).toBe(300.5);
    const filter = posQuickPricePostgrestOr(300);
    expect(filter).toContain("sale_price.gte.299.5");
    expect(filter).toContain("sale_price.lt.300.5");
    expect(filter).not.toContain("gte.299.51");
    expect(filter).not.toContain("gte.299.49");
  });

  it("does not let a size grid steal the variant cap from other name+price products", () => {
    expect(POS_QUICK_PRICE_NAME_PRODUCT_LIMIT).toBe(80);
    expect(POS_QUICK_PRICE_VARIANT_LIMIT).toBeGreaterThanOrEqual(1000);
    expect(POS_QUICK_PRICE_VARIANT_LIMIT).toBeGreaterThan(POS_QUICK_PRICE_NAME_PRODUCT_LIMIT);
  });

  it("keeps badge/spec agreement: only name+price rows survive the filter", () => {
    const rows = [
      { products: { product_name: "JEANS" }, sale_price: 300, mrp: 350, stock_qty: 10 },
      { products: { product_name: "JEANS" }, sale_price: 499, mrp: 499, stock_qty: 2 },
      { products: { product_name: "JACKET" }, sale_price: 300, mrp: 300, stock_qty: 1 },
      { products: { product_name: "SHIRT" }, sale_price: 300, mrp: 300, stock_qty: 4 },
    ];
    const hits = filterPosQuickPriceCodeRows(rows, "j", 300);
    expect(hits.map((r) => r.products?.product_name)).toEqual(["JEANS", "JACKET"]);
  });
});
