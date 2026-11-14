// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildLabelHtml, genEAN8, hasAbsolutePositioning, type LabelHtmlContext } from "@/lib/barcode/labelHtml";
import type { LabelDesignConfig, LabelItem } from "@/types/labelTypes";

const field = (show: boolean, extra: Record<string, unknown> = {}) => ({ show, fontSize: 8, bold: false, ...extra });
const stacked = {
  brand: field(false),
  businessName: field(true),
  productName: field(true),
  price: field(true),
  size: field(false),
  barcodeText: field(false),
  fieldOrder: ["businessName", "productName", "price", "size", "barcodeText"],
  barcodeHeight: 20,
  barcodeWidth: 1.5,
} as unknown as LabelDesignConfig;
const item = { barcode: "100001", product_name: "COTTON <SHIRT>", sale_price: 999, size: "M", qty: 1 } as unknown as LabelItem;
const ctx = (labelConfig: LabelDesignConfig): LabelHtmlContext => ({ labelConfig, businessName: "ACME", labelWidthMm: 50, labelHeightMm: 25 });

/** The label HTML builder moved out of BarcodePrinting.tsx (Plan Phase 4, S4). */
describe("buildLabelHtml", () => {
  it("shows the enabled fields, escapes text, and leaves out hidden fields", () => {
    const html = buildLabelHtml(item, "BT1", ctx(stacked));
    expect(html).toContain("ACME");
    expect(html).toContain("COTTON &lt;SHIRT&gt;");
    expect(html).not.toContain("<SHIRT>");
    expect(html).toContain("Rs.999");
    expect(html).not.toContain('class="size"');
  });

  it("a designer layout (x / y on a field) positions fields absolutely", () => {
    const designed = { ...stacked, productName: field(true, { x: 2, y: 3, width: 80 }) } as unknown as LabelDesignConfig;
    expect(hasAbsolutePositioning(stacked)).toBe(false);
    expect(hasAbsolutePositioning(designed)).toBe(true);
    const html = buildLabelHtml(item, "BT1", ctx(designed));
    expect(html).toContain("position: absolute");
    expect(html).toContain("COTTON &lt;SHIRT&gt;");
  });

  it("genEAN8 gives 8 digits with a valid check digit", () => {
    for (let i = 0; i < 20; i += 1) {
      const code = genEAN8();
      expect(code).toMatch(/^\d{8}$/);
      const d = code.split("").map(Number);
      const sum = d[0] * 3 + d[1] + d[2] * 3 + d[3] + d[4] * 3 + d[5] + d[6] * 3;
      expect((10 - (sum % 10)) % 10).toBe(d[7]);
    }
  });

  it("Barcode Printing builds labels through the module", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
    const page = readFileSync(join(root, "src/pages/BarcodePrinting.tsx"), "utf8");
    expect(page).toContain("return buildLabelHtml(item, format, {");
    expect(page).not.toContain("const genEAN8");
  });
});
