import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateGSTBreakup, calculateInvoiceValue, GST_SLABS } from "./gstRegisterUtils";

describe("40% GST slab", () => {
  it("is offered in the Sales Invoice GST list", () => {
    expect(GST_SLABS).toContain(40);
  });

  it("splits 40% into CGST 20% + SGST 20% within the state", () => {
    const b = calculateGSTBreakup([{ gst_percent: 40, line_total: 1400 }], "inclusive", false);
    expect(b.taxable_40).toBe(1000);
    expect(b.cgst_20).toBe(200);
    expect(b.sgst_20).toBe(200);
    expect(b.igst_40).toBe(0);
    expect(calculateInvoiceValue(b)).toBe(1400);
  });

  it("books 40% as IGST between states, and adds to other slabs on the same bill", () => {
    const b = calculateGSTBreakup(
      [
        { gst_percent: 40, line_total: 1000 },
        { gst_percent: 5, line_total: 200 },
      ],
      "exclusive",
      true,
    );
    expect(b.taxable_40).toBe(1000);
    expect(b.igst_40).toBe(400);
    expect(b.cgst_20 + b.sgst_20).toBe(0);
    expect(calculateInvoiceValue(b)).toBe(1000 + 400 + 200 + 10);
  });

  it("is in every sale, purchase and product GST picker", () => {
    const root = process.cwd();
    const has40 = (rel: string, pattern: RegExp) =>
      expect(readFileSync(join(root, rel), "utf8")).toMatch(pattern);
    has40("src/components/pos/PosCartRow.tsx", /<option value="40">40%<\/option>/);
    has40("src/components/purchase/PurchaseLineRow.tsx", /<SelectItem value="40">40%<\/SelectItem>/);
    has40("src/components/ProductEditPanel.tsx", /GST_RATES = \[0, 5, 12, 18, 28, 40\]/);
    has40("src/components/ProductEntryDialog.tsx", /\[0, 5, 12, 18, 28, 40\]\.map/);
    has40("src/pages/ProductEntry.tsx", /\[0, 5, 12, 18, 28, 40\]\.map/);
    has40("src/pages/BulkProductUpdate.tsx", /GST_OPTIONS = \[0, 5, 12, 18, 28, 40\]/);
    has40("src/components/mobile/QuickAddProductDialog.tsx", /value: "40", label: "40%"/);
    has40("src/lib/validations.ts", /\[0, 5, 12, 18, 28, 40\]\.includes/);
  });
});
