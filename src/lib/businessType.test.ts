import { describe, expect, it } from "vitest";
import { applySupermarketSetup, isSupermarket, readBusinessType } from "./businessType";
import { importRowSize, normalizeImportUom, productEntryFields, productEntrySupermarketSampleData } from "@/utils/excelImportUtils";
import { classifyBarcodeSource } from "@/utils/barcodeChecksum";

/** Supermarket go-live (Nov 2026): one switch for the settings a supermarket needs. */
describe("business type", () => {
  it("defaults to garment", () => {
    expect(readBusinessType(null)).toBe("garment");
    expect(readBusinessType({ product_settings: { business_type: "supermarket" } })).toBe("supermarket");
    expect(isSupermarket({ product_settings: {} })).toBe(false);
  });

  it("supermarket setup: no sizes, colour/style off, scan EAN, MRP on; renamed labels and other settings kept", () => {
    const before = {
      product_settings: { default_size_group: "abc", fields: { color: { label: "Shade", enabled: true }, brand: { enabled: true } } as never, low_stock_threshold: 5 },
      purchase_settings: { barcode_mode: "auto" as const, show_mrp: false, default_uom: "NOS" },
      sale_settings: { pos_bill_format: "thermal" },
    };
    const after = applySupermarketSetup(before);
    expect(after.product_settings).toMatchObject({
      business_type: "supermarket",
      default_size_group: "none",
      low_stock_threshold: 5,
      fields: { color: { label: "Shade", enabled: false }, style: { enabled: false }, brand: { enabled: true } },
    });
    expect(after.purchase_settings).toEqual({ barcode_mode: "scan", show_mrp: true, track_batch_expiry: true, default_uom: "NOS" });
    expect(after.sale_settings).toBe(before.sale_settings);
    // Input untouched.
    expect(before.product_settings.default_size_group).toBe("abc");
  });
});

describe("item import for supermarkets", () => {
  it("MRP can be mapped", () => {
    expect(productEntryFields.map((f) => f.key)).toContain("mrp");
  });

  it("units typed in the sheet become the app's units", () => {
    expect(normalizeImportUom("Kgs")).toBe("KG");
    expect(normalizeImportUom(" kg. ")).toBe("KG");
    expect(normalizeImportUom("Litre")).toBe("LTR");
    expect(normalizeImportUom("gm")).toBe("GMS");
    expect(normalizeImportUom("pcs")).toBe("PCS");
    expect(normalizeImportUom("")).toBe("NOS");
    expect(normalizeImportUom("bundle")).toBe("NOS");
  });

  it("a blank size is None, like Add Product with no sizes", () => {
    expect(importRowSize("")).toBe("None");
    expect(importRowSize(undefined)).toBe("None");
    expect(importRowSize(" XL ")).toBe("XL");
  });

  it("the sample sheet's company barcodes are real EANs (kept as external barcodes)", () => {
    for (const row of productEntrySupermarketSampleData.filter((r) => r.barcode)) {
      expect(classifyBarcodeSource(row.barcode).source).toBe("external");
    }
  });
});
