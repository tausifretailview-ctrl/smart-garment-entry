import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const dialog = readFileSync(join(here, "../components/ProductEntryDialog.tsx"), "utf8");

function sliceBetween(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  expect(from).toBeGreaterThanOrEqual(0);
  const to = source.indexOf(end, from + start.length);
  expect(to).toBeGreaterThan(from);
  return source.slice(from, to);
}

// Press 1 pre-fills Add Product from last_product_details. That key used to be
// written only after a new product insert. Adding IMEIs onto an existing model
// (OPPO A6X 5G on a bill that already has that master) skipped the write, so
// the next window still showed an older product such as BOLTION PB.
describe("purchase Add Product remembers the product just added to the bill", () => {
  it("writes last-product memory when Add to Bill reuses an existing master", () => {
    const reuse = sliceBetween(
      dialog,
      "const useExistingProductForTypedSizes",
      "onUseExistingProductSizes({ productId, rows });",
    );
    expect(reuse).toContain("rememberAddedProductForNextEntry()");
    expect(reuse.indexOf("if (!onUseExistingProductSizes) return;")).toBeLessThan(
      reuse.indexOf("rememberAddedProductForNextEntry()"),
    );
  });

  it("writes the same memory when a shared barcode is added onto the existing product", () => {
    const barcodeReuse = sliceBetween(
      dialog,
      "if (onUseExistingProduct) {",
      "onUseExistingProduct(buildUseExistingProductPayload",
    );
    expect(barcodeReuse).toContain("rememberAddedProductForNextEntry()");
  });

  it("still writes that memory after a new product master is inserted", () => {
    const created = sliceBetween(
      dialog,
      'description: `Product "${productName}" created`',
      "commitProductFormSuggestions(formData);",
    );
    expect(created).toContain("rememberAddedProductForNextEntry()");
  });

  it("memory write clears the unsaved draft so the next open does not restore an older form", () => {
    const remember = sliceBetween(
      dialog,
      "const rememberAddedProductForNextEntry",
      "const updateCopyDropdownPos",
    );
    expect(remember).toContain("saveLastProductDetails()");
    expect(remember).toContain("skipUnsavedDraftPersistRef.current = true");
    expect(remember).toContain("clearProductEntryUnsavedDraft(currentOrganization.id)");
  });
});
