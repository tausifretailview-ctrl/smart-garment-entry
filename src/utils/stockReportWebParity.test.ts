import { describe, expect, it } from "vitest";
import {
  ownerStockSearchToRpc,
  parseStockReportTotalsPayload,
  productClosingFilterForStatus,
  productRowMatchesStatus,
  stockQtyStatus,
  stockStatusToRpcArgs,
} from "./stockReportWebParity";

describe("parseStockReportTotalsPayload", () => {
  it("reads the same JSON shape as web Stock Report", () => {
    expect(
      parseStockReportTotalsPayload({
        total_stock: 18800,
        stock_value: 190000,
        sale_value: 1160000,
        variant_count: 4321,
      }),
    ).toEqual({
      totalStock: 18800,
      stockValue: 190000,
      saleValue: 1160000,
      variantCount: 4321,
    });
  });

  it("accepts a one-row array from PostgREST", () => {
    expect(parseStockReportTotalsPayload([{ total_stock: 3, stock_value: 1, sale_value: 2, variant_count: 4 }])).toEqual({
      totalStock: 3,
      stockValue: 1,
      saleValue: 2,
      variantCount: 4,
    });
  });
});

describe("stockQtyStatus", () => {
  it("matches web Stock Report (threshold 10)", () => {
    expect(stockQtyStatus(0)).toBe("out");
    expect(stockQtyStatus(1)).toBe("low");
    expect(stockQtyStatus(10)).toBe("low");
    expect(stockQtyStatus(11)).toBe("in");
  });
});

describe("stockStatusToRpcArgs", () => {
  it("mirrors StockReport buildStockReportRpcFilters", () => {
    expect(stockStatusToRpcArgs("all")).toEqual({
      p_in_stock: null,
      p_low_stock: null,
      p_low_stock_band: null,
      p_low_stock_threshold: 10,
    });
    expect(stockStatusToRpcArgs("in").p_in_stock).toBe(true);
    expect(stockStatusToRpcArgs("out").p_low_stock).toBe(true);
    expect(stockStatusToRpcArgs("low").p_low_stock_band).toBe(true);
  });
});

describe("ownerStockSearchToRpc", () => {
  it("sends numeric tokens to barcode so name ILIKE is not AND-ed", () => {
    expect(ownerStockSearchToRpc("40001067")).toEqual({ searchQuery: "", barcodeFilter: "40001067" });
    expect(ownerStockSearchToRpc("1 PIECE")).toEqual({ searchQuery: "1 PIECE", barcodeFilter: "" });
    expect(ownerStockSearchToRpc("PUL204")).toEqual({ searchQuery: "PUL204", barcodeFilter: "" });
  });
});

describe("productRowMatchesStatus", () => {
  it("splits in-stock RPC rows into in vs low using the web threshold", () => {
    expect(productClosingFilterForStatus("in")).toBe("in_stock");
    expect(productClosingFilterForStatus("low")).toBe("in_stock");
    expect(productClosingFilterForStatus("out")).toBe("zero_stock");
    expect(productRowMatchesStatus(12, "in")).toBe(true);
    expect(productRowMatchesStatus(5, "in")).toBe(false);
    expect(productRowMatchesStatus(5, "low")).toBe(true);
    expect(productRowMatchesStatus(0, "out")).toBe(true);
  });
});
