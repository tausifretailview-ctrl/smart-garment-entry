import { describe, expect, it } from "vitest";
import {
  isStockReportBarcodeLikeSearch,
  liveBarcodesForStockReportRetry,
  stockReportPurchaseMissHint,
  type PurchaseBarcodeStockResolution,
} from "./stockReportPurchaseBarcodeResolve";

describe("isStockReportBarcodeLikeSearch", () => {
  it("accepts digit barcodes of length >= 4", () => {
    expect(isStockReportBarcodeLikeSearch("0040017398")).toBe(true);
    expect(isStockReportBarcodeLikeSearch("123")).toBe(false);
    expect(isStockReportBarcodeLikeSearch("PUG42")).toBe(false);
  });
});

describe("liveBarcodesForStockReportRetry", () => {
  const base: PurchaseBarcodeStockResolution = {
    purchaseBarcode: "0040017398",
    skuId: "v1",
    liveBarcode: "0040017398",
    productName: "PUG42",
    stockQty: 3,
    excludeReason: null,
  };

  it("returns empty when live barcode equals search (RPC already searched it)", () => {
    expect(liveBarcodesForStockReportRetry([base], "0040017398")).toEqual([]);
  });

  it("returns live barcode when master drifted after merge", () => {
    expect(
      liveBarcodesForStockReportRetry(
        [{ ...base, liveBarcode: "9990017398" }],
        "0040017398",
      ),
    ).toEqual(["9990017398"]);
  });

  it("skips excluded (soft-deleted / inactive) resolutions", () => {
    expect(
      liveBarcodesForStockReportRetry(
        [
          {
            ...base,
            liveBarcode: "9990017398",
            excludeReason: "Variant is soft-deleted (Stock Report hides deleted variants)",
          },
        ],
        "0040017398",
      ),
    ).toEqual([]);
  });
});

describe("stockReportPurchaseMissHint", () => {
  const base: PurchaseBarcodeStockResolution = {
    purchaseBarcode: "0040017398",
    skuId: "v1",
    liveBarcode: "0040017398",
    productName: "PUG42",
    stockQty: 3,
    excludeReason: null,
  };

  it("returns null when the SKU is eligible (empty table is enough)", () => {
    expect(stockReportPurchaseMissHint([base])).toBeNull();
  });

  it("explains inactive products in shop language", () => {
    expect(
      stockReportPurchaseMissHint([
        { ...base, excludeReason: "Variant is inactive (Stock Report requires active=true)" },
      ]),
    ).toEqual({
      title: "Product is inactive",
      description:
        "Barcode 0040017398 (PUG42) is on a purchase bill, but the product is inactive so Stock Report hides it.",
    });
  });

  it("explains recycle-bin SKUs in shop language", () => {
    const hint = stockReportPurchaseMissHint([
      {
        ...base,
        excludeReason: "Variant is soft-deleted (Stock Report hides deleted variants)",
      },
    ]);
    expect(hint?.title).toBe("Product was deleted");
    expect(hint?.description).toContain("Recycle Bin");
  });
});
