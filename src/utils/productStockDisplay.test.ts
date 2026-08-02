import { describe, expect, it } from "vitest";
import {
  displaySaleStockQty,
  isNonStockTrackedProduct,
  SERVICE_VIRTUAL_STOCK_QTY,
} from "./productStockDisplay";

describe("displaySaleStockQty", () => {
  it("shows 1 for service even when DB has virtual 999999", () => {
    expect(displaySaleStockQty("service", SERVICE_VIRTUAL_STOCK_QTY)).toBe(1);
  });

  it("shows 1 for service when virtual stock has drifted (e.g. after a sale)", () => {
    expect(displaySaleStockQty("service", 999998)).toBe(1);
    expect(displaySaleStockQty("service", 1)).toBe(1);
    expect(displaySaleStockQty("service", 0)).toBe(1);
  });

  it("shows 1 for combo products", () => {
    expect(displaySaleStockQty("combo", 999999)).toBe(1);
  });

  it("passes through real stock for goods", () => {
    expect(displaySaleStockQty("goods", 12)).toBe(12);
    expect(displaySaleStockQty("goods", 0)).toBe(0);
    expect(displaySaleStockQty(null, 5)).toBe(5);
  });
});

describe("isNonStockTrackedProduct", () => {
  it("identifies service and combo", () => {
    expect(isNonStockTrackedProduct("service")).toBe(true);
    expect(isNonStockTrackedProduct("combo")).toBe(true);
    expect(isNonStockTrackedProduct("goods")).toBe(false);
  });
});
