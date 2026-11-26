import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * KLEAR TRADING INV/26-27/31 (Nov 2026): exclusive bill whose line totals already hold GST.
 * Discount (0.68) and round off (0.65) together put the bill ₹1.33 away from Σ lines, so the
 * print's "within ₹1" test read the lines as taxable and printed GST again on top (CGST/SGST
 * 2,178.80 instead of 2,009). The print and templates must use resolveInvoiceLineTaxMode,
 * which keeps whichever reading is closer to the bill total.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("invoice: GST-inclusive line totals are recognised", () => {
  it("InvoiceWrapper and RetailERPTemplate decide with resolveInvoiceLineTaxMode, not a ₹1 test", () => {
    for (const p of ["components/InvoiceWrapper.tsx", "components/invoice-templates/RetailERPTemplate.tsx"]) {
      const src = read(p);
      expect(src, p).toMatch(/resolveInvoiceLineTaxMode\(/);
      expect(src, p).not.toMatch(/lineTotalsEmbedGst =\s*taxType === "exclusive" &&\s*Math\.abs\(/);
    }
  });

  it("templates with a tax summary pass the bill discount", () => {
    for (const p of [
      "components/invoice-templates/ModernWholesaleTemplate.tsx",
      "components/invoice-templates/WholesaleSizeA4Template.tsx",
    ]) {
      const src = read(p);
      const call = src.slice(src.indexOf("buildHsnTaxSummary({"));
      expect(call.slice(0, call.indexOf("});")), p).toMatch(/\bdiscount\b/);
    }
  });
});
