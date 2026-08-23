import { describe, expect, it } from "vitest";
import {
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
