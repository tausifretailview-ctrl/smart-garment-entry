import { describe, expect, it } from "vitest";
import type { LabelItem } from "@/types/labelTypes";
import {
  ensureCompleteFieldOrder,
  mapPrinterPresetFromRow,
  mergeLabelField,
  resolvePresetLabelConfig,
  sortItemsBySize,
} from "./barcodeLabelConfig";
import { builtInLabelTemplates, sheetPresetLabels, sheetPresets } from "./sheetPresets";

const item = (over: Partial<LabelItem>) => ({ product_name: "", size: "", barcode: "", sale_price: 0, ...over }) as LabelItem;

describe("sortItemsBySize", () => {
  const items = [
    item({ product_name: "SHIRT", size: "XL-44", barcode: "100010", sale_price: 900 }),
    item({ product_name: "BELT", size: "32", barcode: "100002", sale_price: 300 }),
    item({ product_name: "JEANS", size: "M-40", barcode: "100100", sale_price: 1200 }),
  ];
  const names = (xs: LabelItem[]) => xs.map((x) => x.product_name);
  it("keeps Sr No order for none (same array)", () => {
    expect(sortItemsBySize(items, "none")).toBe(items);
  });
  it("sizes by their number, both ways", () => {
    expect(names(sortItemsBySize(items, "ascending"))).toEqual(["BELT", "JEANS", "SHIRT"]);
    expect(names(sortItemsBySize(items, "descending"))).toEqual(["SHIRT", "JEANS", "BELT"]);
  });
  it("barcodes numerically, names A-Z, prices both ways; input untouched", () => {
    expect(names(sortItemsBySize(items, "barcode_asc"))).toEqual(["BELT", "SHIRT", "JEANS"]);
    expect(names(sortItemsBySize(items, "barcode_desc"))).toEqual(["JEANS", "SHIRT", "BELT"]);
    expect(names(sortItemsBySize(items, "name_asc"))).toEqual(["BELT", "JEANS", "SHIRT"]);
    expect(names(sortItemsBySize(items, "price_desc"))).toEqual(["JEANS", "SHIRT", "BELT"]);
    expect(names(items)).toEqual(["SHIRT", "BELT", "JEANS"]);
  });
});

describe("label config helpers", () => {
  it("mergeLabelField keeps saved values over the fallback", () => {
    const fallback = { show: true, fontSize: 8, bold: false, textAlign: "center" as const, x: 0, y: 0, width: 100 };
    expect(mergeLabelField({ fontSize: 12 }, fallback)).toEqual({ ...fallback, fontSize: 12 });
    expect(mergeLabelField(undefined, fallback)).toEqual(fallback);
  });

  it("ensureCompleteFieldOrder appends fields an old config never had", () => {
    const full = ensureCompleteFieldOrder({ fieldOrder: ["barcode", "price"] });
    expect(full.fieldOrder.slice(0, 2)).toEqual(["barcode", "price"]);
    expect(full.fieldOrder).toContain("supplierInvoiceNo");
    expect(new Set(full.fieldOrder).size).toBe(full.fieldOrder.length);
    expect(full.barcode).toBeDefined();
    expect(full).not.toHaveProperty("labelStyle");
  });

  it("resolvePresetLabelConfig falls back to a complete config for an ordinary name", () => {
    const cfg = resolvePresetLabelConfig("My Shop 50x25", { fieldOrder: ["price"] });
    expect(cfg.fieldOrder[0]).toBe("price");
    expect(cfg.fieldOrder.length).toBeGreaterThan(10);
  });

  it("mapPrinterPresetFromRow reads a printer_presets row", () => {
    const p = mapPrinterPresetFromRow({
      id: 7, name: "TSC 50x25", x_offset: "1.5", y_offset: 0, v_gap: 2, h_gap: null,
      label_width: 50, label_height: 25, a4_cols: null, print_mode: "thermal", is_default: 1, thermal_cols: 2,
    });
    expect(p).toMatchObject({ id: "7", name: "TSC 50x25", xOffset: 1.5, hGap: 0, width: 50, height: 25, a4Cols: undefined, printMode: "thermal", isDefault: true, thermalCols: 2 });
  });
});

describe("sheet presets", () => {
  it("every preset has a menu label and the default A4 sheet exists", () => {
    for (const key of Object.keys(sheetPresets)) expect(sheetPresetLabels[key], key).toBeDefined();
    expect(sheetPresets).toHaveProperty("novajet48");
    expect(builtInLabelTemplates.length).toBeGreaterThan(0);
  });
});
