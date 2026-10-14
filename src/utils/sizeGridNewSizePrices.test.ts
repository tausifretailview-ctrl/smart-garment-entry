import { describe, expect, it } from "vitest";
import { sizeGridNewSizePrices, typedPriceOr } from "./sizeGridNewSizePrices";

const black = [
  { pur_price: 500, sale_price: 999, mrp: 1299 },
  { pur_price: 500, sale_price: 999, mrp: 1299 },
];

describe("sizeGridNewSizePrices", () => {
  it("new colour carries the MRP typed for its previous new size, not the old colour's", () => {
    const prices = sizeGridNewSizePrices({
      colorVariants: [],
      allVariants: black,
      addedSizes: [{ pur_price: 600, sale_price: 1199, mrp: 1499 }],
      productPurPrice: 500,
      productSalePrice: 999,
    });
    expect(prices).toEqual({ pur_price: 600, sale_price: 1199, mrp: 1499 });
  });

  it("first size of a new colour starts from the product's MRP, never the sale price", () => {
    const prices = sizeGridNewSizePrices({
      colorVariants: [],
      allVariants: black,
      productPurPrice: 500,
      productSalePrice: 999,
    });
    expect(prices.mrp).toBe(1299);
    expect(prices.sale_price).toBe(999);
  });

  it("new size in an existing colour uses that colour's own prices", () => {
    const prices = sizeGridNewSizePrices({
      colorVariants: [{ pur_price: 700, sale_price: 1399, mrp: 1599 }],
      allVariants: [...black, { pur_price: 700, sale_price: 1399, mrp: 1599 }],
      productPurPrice: 500,
      productSalePrice: 999,
    });
    expect(prices).toEqual({ pur_price: 700, sale_price: 1399, mrp: 1599 });
  });

  it("falls back to the sale price only when no size has an MRP", () => {
    const prices = sizeGridNewSizePrices({
      colorVariants: [],
      allVariants: [{ pur_price: 200, sale_price: 450, mrp: 0 }],
    });
    expect(prices).toEqual({ pur_price: 200, sale_price: 450, mrp: 450 });
  });

  it("explicit grid defaults still win over existing sizes", () => {
    const prices = sizeGridNewSizePrices({
      colorVariants: black,
      allVariants: black,
      defaultPurPrice: 550,
      defaultSalePrice: 1050,
      defaultMrp: 1350,
    });
    expect(prices).toEqual({ pur_price: 550, sale_price: 1050, mrp: 1350 });
  });
});

describe("typedPriceOr", () => {
  it("uses a typed positive price, else the fallback", () => {
    expect(typedPriceOr("1499", 1299)).toBe(1499);
    expect(typedPriceOr("", 1299)).toBe(1299);
    expect(typedPriceOr("0", 1299)).toBe(1299);
    expect(typedPriceOr("abc", 1299)).toBe(1299);
  });
});
