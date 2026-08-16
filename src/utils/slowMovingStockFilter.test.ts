import { describe, expect, it } from "vitest";
import {
  filterSlowMovingStockRows,
  matchesSlowMovingProductFilter,
} from "./slowMovingStockFilter";

const row = {
  product_name: "Galaxy Buds",
  barcode: "880123",
  brand: "SAMSUNG",
  category: "Audio",
};

describe("matchesSlowMovingProductFilter", () => {
  it("empty query matches all", () => {
    expect(matchesSlowMovingProductFilter(row, "")).toBe(true);
    expect(matchesSlowMovingProductFilter(row, "   ")).toBe(true);
  });

  it("matches name, barcode, brand, category", () => {
    expect(matchesSlowMovingProductFilter(row, "galaxy")).toBe(true);
    expect(matchesSlowMovingProductFilter(row, "880")).toBe(true);
    expect(matchesSlowMovingProductFilter(row, "samsung")).toBe(true);
    expect(matchesSlowMovingProductFilter(row, "audio")).toBe(true);
  });

  it("rejects non-matches", () => {
    expect(matchesSlowMovingProductFilter(row, "nike")).toBe(false);
  });
});

describe("filterSlowMovingStockRows", () => {
  it("empty query returns same array reference length (all rows)", () => {
    const rows = [row, { ...row, product_name: "Other" }];
    expect(filterSlowMovingStockRows(rows, "")).toBe(rows);
    expect(filterSlowMovingStockRows(rows, "galaxy")).toHaveLength(1);
  });
});
