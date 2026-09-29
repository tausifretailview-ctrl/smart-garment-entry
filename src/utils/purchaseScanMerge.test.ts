import { describe, expect, it } from "vitest";
import { findPurchaseScanMergeIndex, findPurchaseScanSameUnitIndex } from "./purchaseScanMerge";

const EAN = "8901326331163";

describe("findPurchaseScanMergeIndex", () => {
  it("does not merge a universal barcode picked at another price (other SKU)", () => {
    const lines = [{ sku_id: "c749", barcode: EAN, sale_price: 749, mrp: 0 }];
    expect(findPurchaseScanMergeIndex(lines, { skuId: "d729", barcode: EAN, salePrice: 729 })).toBe(-1);
  });

  it("re-scan of the same SKU adds to its line, even if the rate was edited", () => {
    const lines = [{ sku_id: "c749", barcode: EAN, sale_price: 800, mrp: 0 }];
    expect(findPurchaseScanMergeIndex(lines, { skuId: "c749", barcode: EAN, salePrice: 749 })).toBe(0);
  });

  it("a picked new price does not merge into the old-price line of the same SKU", () => {
    const lines = [{ sku_id: "c749", barcode: EAN, sale_price: 749, mrp: 0 }];
    expect(
      findPurchaseScanMergeIndex(lines, { skuId: "c749", barcode: EAN, salePrice: 799, requirePrice: true }),
    ).toBe(-1);
    expect(
      findPurchaseScanMergeIndex(lines, { skuId: "c749", barcode: EAN, salePrice: 749, requirePrice: true }),
    ).toBe(0);
  });

  it("barcode alone matches only a line without a SKU", () => {
    const lines = [
      { sku_id: "", barcode: EAN, sale_price: 749 },
      { sku_id: "x", barcode: "OTHER", sale_price: 10 },
    ];
    expect(findPurchaseScanMergeIndex(lines, { skuId: "new", barcode: EAN, salePrice: 749 })).toBe(0);
  });
});

describe("findPurchaseScanSameUnitIndex (IMEI duplicates)", () => {
  it("finds the unit by SKU or barcode at any price", () => {
    const lines = [{ sku_id: "u1", barcode: "IMEI1", sale_price: 100 }];
    expect(findPurchaseScanSameUnitIndex(lines, { skuId: "u2", barcode: "IMEI1" })).toBe(0);
    expect(findPurchaseScanSameUnitIndex(lines, { skuId: "u1", barcode: "" })).toBe(0);
    expect(findPurchaseScanSameUnitIndex(lines, { skuId: "u3", barcode: "IMEI3" })).toBe(-1);
  });
});
