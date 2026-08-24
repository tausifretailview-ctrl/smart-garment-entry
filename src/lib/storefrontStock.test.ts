import { describe, expect, it } from "vitest";
import { lookupMap } from "./coerceToMap";
import {
  aggregateWebsiteVariantStock,
  classifyStorefrontStock,
  formatStorefrontPrice,
  storefrontStockLabel,
} from "./storefrontStock";

describe("storefrontStock", () => {
  it("never exposes raw quantity on the in-stock label", () => {
    expect(classifyStorefrontStock(48)).toEqual({
      status: "in_stock",
      stockLeft: null,
      label: "In Stock",
    });
    expect(classifyStorefrontStock(6)).toEqual({
      status: "in_stock",
      stockLeft: null,
      label: "In Stock",
    });
  });

  it("shows Only N left at or below the threshold", () => {
    expect(classifyStorefrontStock(5)).toEqual({
      status: "low_stock",
      stockLeft: 5,
      label: "Only 5 left",
    });
    expect(classifyStorefrontStock(1)).toEqual({
      status: "low_stock",
      stockLeft: 1,
      label: "Only 1 left",
    });
  });

  it("marks zero or invalid as out of stock", () => {
    expect(classifyStorefrontStock(0).status).toBe("out_of_stock");
    expect(classifyStorefrontStock(-2).status).toBe("out_of_stock");
    expect(classifyStorefrontStock(Number.NaN).status).toBe("out_of_stock");
  });

  it("formats labels from public payload fields", () => {
    expect(storefrontStockLabel("in_stock", null)).toBe("In Stock");
    expect(storefrontStockLabel("low_stock", 3)).toBe("Only 3 left");
    expect(storefrontStockLabel("out_of_stock", null)).toBe("Out of Stock");
  });

  it("formats INR without decimals", () => {
    expect(formatStorefrontPrice(1299)).toMatch(/1,299/);
    expect(formatStorefrontPrice(null)).toBe("");
  });
});

describe("aggregateWebsiteVariantStock", () => {
  it("sums qty per product and keeps the first sale price", () => {
    const stock = aggregateWebsiteVariantStock([
      { product_id: "p1", sale_price: 100, stock_qty: 2 },
      { product_id: "p1", sale_price: 90, stock_qty: 3 },
      { product_id: "p2", sale_price: 50, stock_qty: 1 },
    ]);
    expect(stock.p1).toEqual({ qty: 5, price: 100 });
    expect(stock.p2).toEqual({ qty: 1, price: 50 });
  });

  it("lookupMap still reads after TanStack persist turns a Map into a plain object (live Website tab crash)", () => {
    const live = new Map([["p1", { qty: 4, price: 10 }]]);
    const persisted = JSON.parse(JSON.stringify(Object.fromEntries(live))) as unknown;
    expect(typeof (persisted as { get?: unknown }).get).not.toBe("function");
    expect(lookupMap<{ qty: number; price: number }>(persisted, "p1")).toEqual({ qty: 4, price: 10 });
    expect(lookupMap<{ qty: number; price: number }>(live, "p1")).toEqual({ qty: 4, price: 10 });
  });
});
