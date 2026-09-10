import { describe, expect, it } from "vitest";
import {
  lineBarcodeExistsOnLiveItem,
  pickLiveVariantForExistingLineBarcode,
  purchaseLineBarcodeDivergesFromSku,
  shouldAttachPurchaseLineToExistingBarcode,
} from "./purchaseLineBarcodeMatch";

const existing = {
  id: "sku-existing",
  product_id: "prod-existing",
  barcode: "0040017398",
  barcode_source: "generated" as const,
  size: "7",
  created_at: "2026-01-01T00:00:00.000Z",
};

const newerDuplicate = {
  id: "sku-new",
  product_id: "prod-new",
  barcode: "0040017398",
  barcode_source: "generated" as const,
  size: "7",
  created_at: "2026-09-10T00:00:00.000Z",
};

describe("pickLiveVariantForExistingLineBarcode", () => {
  it("picks the oldest live row when the barcode already exists", () => {
    const picked = pickLiveVariantForExistingLineBarcode(
      [newerDuplicate, existing],
      { lineSize: "7" },
    );
    expect(picked?.id).toBe("sku-existing");
    expect(picked?.product_id).toBe("prod-existing");
  });

  it("prefers a tier-matched sibling when provided", () => {
    const picked = pickLiveVariantForExistingLineBarcode(
      [existing, newerDuplicate],
      { lineSize: "7", tierMatchIds: new Set(["sku-new"]) },
    );
    expect(picked?.id).toBe("sku-new");
  });

  it("prefers size match among same-age rows", () => {
    const size8 = {
      ...existing,
      id: "sku-8",
      size: "8",
      created_at: "2026-01-01T00:00:00.000Z",
    };
    const picked = pickLiveVariantForExistingLineBarcode([existing, size8], {
      lineSize: "8",
    });
    expect(picked?.id).toBe("sku-8");
  });
});

describe("shouldAttachPurchaseLineToExistingBarcode", () => {
  it("attaches generated / org-series barcodes that already exist", () => {
    expect(
      shouldAttachPurchaseLineToExistingBarcode({
        lineBarcode: "0040017398",
        liveHits: [existing],
        reuseBarcodeOnFork: false,
      }),
    ).toBe(true);
  });

  it("does not short-circuit manufacturer EAN sibling forks", () => {
    expect(
      shouldAttachPurchaseLineToExistingBarcode({
        lineBarcode: "8901326331101",
        liveHits: [
          {
            id: "sku-729",
            product_id: "prod-729",
            barcode: "8901326331101",
            barcode_source: "external",
          },
        ],
        reuseBarcodeOnFork: true,
      }),
    ).toBe(false);
  });

  it("does not attach when the line barcode is empty", () => {
    expect(
      shouldAttachPurchaseLineToExistingBarcode({
        lineBarcode: "  ",
        liveHits: [existing],
        reuseBarcodeOnFork: false,
      }),
    ).toBe(false);
    expect(lineBarcodeExistsOnLiveItem("", [existing])).toBe(false);
  });
});

describe("purchaseLineBarcodeDivergesFromSku", () => {
  it("detects a line barcode that is not the stocked item barcode", () => {
    expect(
      purchaseLineBarcodeDivergesFromSku({
        lineBarcode: "0040017398",
        skuBarcode: "0040019999",
      }),
    ).toBe(true);
  });

  it("is fine when they match, and skips empty line barcodes", () => {
    expect(
      purchaseLineBarcodeDivergesFromSku({
        lineBarcode: "0040017398",
        skuBarcode: "0040017398",
      }),
    ).toBe(false);
    expect(
      purchaseLineBarcodeDivergesFromSku({
        lineBarcode: "",
        skuBarcode: "0040019999",
      }),
    ).toBe(false);
  });
});
