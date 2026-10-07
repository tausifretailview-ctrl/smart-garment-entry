import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildUseExistingProductConfirmMessage,
  embeddedProductRecord,
  existingProductSizesLoadMessage,
  EXISTING_PRODUCT_SIZES_LOAD_FAILED,
  matchExistingVariantForSizeRow,
  purchaseLinePricesDiffer,
  pickBarcodeVariantForTypedProduct,
  purchaseLinePricesFromUseExisting,
  typedExternalBarcode,
} from "@/utils/purchaseUseExistingProduct";

const here = dirname(fileURLToPath(import.meta.url));

describe("purchaseUseExistingProduct", () => {
  it("detects meaningful sale/pur price drift vs stored variant", () => {
    expect(
      purchaseLinePricesDiffer(
        { pur_price: 200, sale_price: 250 },
        { pur_price: 180, sale_price: 200 },
      ),
    ).toBe(true);
  });

  it("treats tiny rounding differences as a match", () => {
    expect(
      purchaseLinePricesDiffer(
        { pur_price: 200, sale_price: 250.004 },
        { pur_price: 200, sale_price: 250 },
      ),
    ).toBe(false);
  });

  it("keeps user-typed prices on the purchase line", () => {
    expect(
      purchaseLinePricesFromUseExisting(
        { barcode: "8901326331101", pur_price: 524, sale_price: 749 },
        { pur_price: 510, sale_price: 729, mrp: 0 },
      ),
    ).toEqual({ pur_price: 524, sale_price: 749, mrp: 0 });
  });

  it("builds confirmation copy for price drift", () => {
    const message = buildUseExistingProductConfirmMessage(
      { pur_price: 180, sale_price: 200 },
      { pur_price: 200, sale_price: 250 },
    );
    expect(message).toContain("₹200");
    expect(message).toContain("₹250");
    expect(message).toContain("stored price");
  });
});

describe("matchExistingVariantForSizeRow", () => {
  const variants = [
    { id: "m", size: "M", color: "", mrp: 300 },
    { id: "l", size: "L", color: "", mrp: 300 },
    { id: "l-red", size: "L", color: "Red", mrp: 300 },
    { id: "xl-500", size: "XL", color: "", mrp: 500 },
    { id: "xl-300", size: "XL", color: "", mrp: 300 },
  ];

  it("matches size case-insensitively", () => {
    expect(matchExistingVariantForSizeRow(variants, { size: " m ", color: "", mrp: null })?.id).toBe("m");
  });

  it("prefers the exact colour", () => {
    expect(matchExistingVariantForSizeRow(variants, { size: "L", color: "red", mrp: null })?.id).toBe("l-red");
  });

  it("prefers the same MRP tier", () => {
    expect(matchExistingVariantForSizeRow(variants, { size: "XL", color: "", mrp: 300 })?.id).toBe("xl-300");
  });

  it("returns null for a size the product does not have", () => {
    expect(matchExistingVariantForSizeRow(variants, { size: "XXL", color: "", mrp: 300 })).toBeNull();
  });
});

describe("typedExternalBarcode", () => {
  it("keeps a scanned Jockey EAN", () => {
    expect(typedExternalBarcode({ barcode: " 8901326331101 ", barcode_source: "external" })).toBe("8901326331101");
    expect(typedExternalBarcode({ barcode: "8901326331101" })).toBe("8901326331101");
  });

  it("ignores app-generated series codes and blanks", () => {
    expect(typedExternalBarcode({ barcode: "550081106", barcode_source: "generated" })).toBe("");
    expect(typedExternalBarcode({ barcode: "" })).toBe("");
    expect(typedExternalBarcode({})).toBe("");
  });
});

describe("pickBarcodeVariantForTypedProduct", () => {
  const cupB = { id: "b", brand: "JOCKEY", style: "B" };
  const cupC = { id: "c", brand: "JOCKEY", style: "C" };

  it("picks the product with the typed brand + style when a barcode is on several", () => {
    expect(pickBarcodeVariantForTypedProduct([cupB, cupC], { brand: "Jockey", style: "c" })?.id).toBe("c");
  });

  it("falls back to the first when none match", () => {
    expect(pickBarcodeVariantForTypedProduct([cupB, cupC], { brand: "", style: "" })?.id).toBe("b");
  });

  it("returns null for no variants", () => {
    expect(pickBarcodeVariantForTypedProduct([], { brand: "X" })).toBeNull();
  });
});

describe("existing product size load", () => {
  it("shows the database error, and the search hint only when there is none", () => {
    expect(existingProductSizesLoadMessage("column products.uom does not exist")).toBe(
      "column products.uom does not exist",
    );
    expect(existingProductSizesLoadMessage("")).toBe(EXISTING_PRODUCT_SIZES_LOAD_FAILED);
    expect(existingProductSizesLoadMessage(null)).toBe(
      "Could not load the existing product's sizes. Search it in the bill instead.",
    );
  });

  it("reads the product from an object or a one-element embed", () => {
    expect(embeddedProductRecord({ id: "p1" })?.id).toBe("p1");
    expect(embeddedProductRecord([{ id: "p2" }])?.id).toBe("p2");
    expect(embeddedProductRecord([])).toBeNull();
    expect(embeddedProductRecord(null)).toBeNull();
  });

  it("loads the product itself when it has no active sizes, instead of stopping", () => {
    const page = readFileSync(resolve(here, "../pages/PurchaseEntry.tsx"), "utf8");
    const fn = page.slice(
      page.indexOf("const handleUseExistingProductSizesFromDialog"),
      page.indexOf("const items = payload.rows.map"),
    );
    expect(fn).toContain('.or("active.eq.true,active.is.null")');
    expect(fn).toContain('.from("products")');
    expect(fn).toContain("existingProductSizesLoadMessage");
    expect(fn).not.toContain("!data?.length");
  });
});
