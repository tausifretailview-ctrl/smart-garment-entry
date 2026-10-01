import { describe, expect, it } from "vitest";
import {
  divergentPurchaseBarcodeMessage,
  firstDivergentPurchaseBarcode,
  isStockReportBarcodeLikeSearch,
  liveBarcodeMatchesScan,
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

describe("divergent purchase barcode", () => {
  const row = (liveBarcode: string): PurchaseBarcodeStockResolution => ({
    purchaseBarcode: "0040011045",
    skuId: "v-other",
    liveBarcode,
    productName: "PXG03",
    stockQty: 1,
    excludeReason: null,
  });

  it("treats a different live barcode as not this product", () => {
    expect(liveBarcodeMatchesScan("0040012977", "0040011045")).toBe(false);
    expect(liveBarcodeMatchesScan("0040011045", "0040011045")).toBe(true);
    const hit = firstDivergentPurchaseBarcode([row("0040012977")], "0040011045");
    expect(hit).toMatchObject({ scanned: "0040011045", liveBarcode: "0040012977" });
    expect(divergentPurchaseBarcodeMessage(hit!).title).toBe("Barcode 0040011045 is not available");
    expect(divergentPurchaseBarcodeMessage(hit!).description).toContain("0040012977");
  });

  it("does not flag a purchase line whose live barcode is the one scanned", () => {
    expect(firstDivergentPurchaseBarcode([row("0040011045")], "0040011045")).toBeNull();
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
