import { describe, expect, it } from "vitest";
import {
  divergentPurchaseBarcodeMessage,
  firstDivergentPurchaseBarcode,
  isStockReportBarcodeLikeSearch,
  liveBarcodeMatchesScan,
  liveBarcodesForStockReportRetry,
  skuIdsServingScan,
  findLiveTwinsForDeletedLines,
  sizesMatch,
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

describe("skuIdsServingScan (labels printed from purchase bills)", () => {
  const row = (over: Partial<PurchaseBarcodeStockResolution>): PurchaseBarcodeStockResolution => ({
    purchaseBarcode: "0040008507",
    purchaseProductName: "PSB01",
    skuId: "v1",
    liveBarcode: "40004716",
    productName: "PSB01",
    stockQty: 2,
    excludeReason: null,
    ...over,
  });

  it("opens the same item when only the printed label differs from the live barcode", () => {
    expect(skuIdsServingScan([row({})], "0040008507")).toEqual(["v1"]);
    expect(firstDivergentPurchaseBarcode([row({})], "0040008507")).toBeNull();
  });

  it("matches names ignoring case and spacing", () => {
    expect(skuIdsServingScan([row({ purchaseProductName: " psb01 " })], "0040008507")).toEqual(["v1"]);
  });

  it("still blocks a purchase line that points at a different product", () => {
    const other = row({ productName: "PXG03" });
    expect(skuIdsServingScan([other], "0040008507")).toEqual([]);
    expect(firstDivergentPurchaseBarcode([other], "0040008507")).toMatchObject({ liveBarcode: "40004716" });
  });

  it("same name and size duplicates: uses the one with the most stock", () => {
    expect(
      skuIdsServingScan([row({ stockQty: 1 }), row({ skuId: "v2", liveBarcode: "555", stockQty: 6 })], "0040008507"),
    ).toEqual(["v2"]);
  });

  it("picks the size printed on the purchase line (KS Footwear PSB01)", () => {
    const size9 = row({ purchaseSize: "9", liveSize: "9", skuId: "v9", liveBarcode: "40004716", stockQty: 6 });
    const size12 = row({ purchaseSize: "9", liveSize: "12", skuId: "v12", liveBarcode: "0040008510", stockQty: 1 });
    expect(skuIdsServingScan([size12, size9], "0040008507")).toEqual(["v9"]);
    expect(skuIdsServingScan([size12], "0040008507")).toEqual([]);
  });

  it("prefers a SKU whose live barcode is the scanned one", () => {
    expect(
      skuIdsServingScan([row({}), row({ skuId: "v2", liveBarcode: "0040008507" })], "0040008507"),
    ).toEqual(["v2"]);
  });

  it("ignores deleted or inactive items", () => {
    expect(skuIdsServingScan([row({ excludeReason: "Variant is soft-deleted" })], "0040008507")).toEqual([]);
  });
});

describe("deleted purchase-line SKU → live twin (same name + size)", () => {
  const deletedLine: PurchaseBarcodeStockResolution = {
    purchaseBarcode: "0040008507",
    purchaseProductName: "PSB01",
    purchaseSize: "9",
    skuId: "old",
    liveBarcode: "0040008507",
    productName: "PSB01",
    stockQty: 0,
    excludeReason: "Variant is soft-deleted (Stock Report hides deleted variants)",
  };
  const variants = [
    { id: "v9", barcode: "40004716", size: "9", stock_qty: 6, products: { product_name: "PSB01", deleted_at: null, product_type: "goods" } },
    { id: "v12", barcode: "0040008510", size: "12", stock_qty: 1, products: { product_name: "PSB01", deleted_at: null, product_type: "goods" } },
    { id: "x", barcode: "1", size: "9", stock_qty: 9, products: { product_name: "PSB01 GOLD", deleted_at: null, product_type: "goods" } },
  ];
  const client = () => {
    const chain: Record<string, unknown> = {};
    for (const k of ["select", "eq", "is", "ilike"]) chain[k] = () => chain;
    chain.limit = () => Promise.resolve({ data: variants, error: null });
    return { from: () => chain };
  };

  it("finds the live size-9 PSB01 and the scan opens it", async () => {
    const twins = await findLiveTwinsForDeletedLines(client(), "org", [deletedLine]);
    expect(twins.map((t) => t.skuId)).toEqual(["v9"]);
    expect(twins[0].viaTwin).toBe(true);
    expect(skuIdsServingScan([deletedLine, ...twins], "0040008507")).toEqual(["v9"]);
  });

  it("does nothing for lines that are not deleted", async () => {
    expect(await findLiveTwinsForDeletedLines(client(), "org", [{ ...deletedLine, excludeReason: null }])).toEqual([]);
  });

  it("matches sizes loosely but never a different size", () => {
    expect(sizesMatch(" 9 ", "9")).toBe(true);
    expect(sizesMatch(null, "9")).toBe(true);
    expect(sizesMatch("9", "10")).toBe(false);
  });
});
