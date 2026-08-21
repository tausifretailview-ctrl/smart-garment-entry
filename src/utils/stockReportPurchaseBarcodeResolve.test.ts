import { describe, expect, it } from "vitest";
import {
  isStockReportBarcodeLikeSearch,
  liveBarcodesForStockReportRetry,
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
