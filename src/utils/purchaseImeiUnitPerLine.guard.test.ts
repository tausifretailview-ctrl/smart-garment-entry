import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../..");
const purchaseEntry = readFileSync(join(root, "src/pages/PurchaseEntry.tsx"), "utf8");
const productDialog = readFileSync(join(root, "src/components/ProductEntryDialog.tsx"), "utf8");

// Bug: a second phone with the same product details (same model/colour) was
// matched to the first phone's variant, so both bill lines showed the first IMEI.
describe("Purchase Entry: every serialised unit keeps its own IMEI", () => {
  it("Use existing (Add Product name dupe) passes the scanned IMEI to the bill", () => {
    const fn = productDialog.slice(
      productDialog.indexOf("const useExistingProductForTypedSizes"),
      productDialog.indexOf("onUseExistingProductSizes({ productId, rows });"),
    );
    expect(fn).toContain("barcode: String(v.barcode");
    expect(fn).toContain("barcode_source: v.barcode_source");
  });

  it("serialised Use existing rows are not matched onto an existing unit by size/colour", () => {
    const fn = purchaseEntry.slice(
      purchaseEntry.indexOf("const handleUseExistingProductSizesFromDialog"),
      purchaseEntry.indexOf("const items = payload.rows.map"),
    );
    expect(fn).toContain("addSerializedUnitsFromUseExisting(");
  });

  it("picking a serialised product from search or the size grid asks for a new IMEI", () => {
    const inline = purchaseEntry.slice(
      purchaseEntry.indexOf("const addInlineRow = async"),
      purchaseEntry.indexOf("let skuId = variant.id;", purchaseEntry.indexOf("const addInlineRow = async")),
    );
    expect(inline).toContain("openImeiScanForLine(line, 1)");
    const grid = purchaseEntry.slice(
      purchaseEntry.indexOf("const handleSizeGridConfirm = async"),
      purchaseEntry.indexOf("let barcode = variant.barcode || \"\";", purchaseEntry.indexOf("const handleSizeGridConfirm = async")),
    );
    expect(grid).toContain("imeiScans.push(");
  });

  it("IMEI edit on a line that shares its variant forks a new unit instead of renaming both", () => {
    const fn = purchaseEntry.slice(purchaseEntry.indexOf("const handleImeiCorrection"));
    expect(fn.slice(0, 2500)).toContain("sharesVariant");
  });

  it("save refuses two serialised lines on the same IMEI", () => {
    expect(purchaseEntry).toContain('title: "Same IMEI on two lines"');
  });
});
