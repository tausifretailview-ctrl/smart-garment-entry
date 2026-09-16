import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

function source(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

describe("invoice UPI QR uses the shared company UPI resolver", () => {
  it("InvoiceWrapper (Sale A4 / POS A5) resolves default vs DC via helper", () => {
    const tsx = source("InvoiceWrapper.tsx");
    expect(tsx).toContain("resolveInvoiceUpiId");
    expect(tsx).toContain("resolveCompanyUpiId");
    expect(tsx).not.toMatch(/bill_barcode_settings\?\.upi_id/);
  });

  it("thermal POS/Sale receipts share the same DC-aware helper", () => {
    for (const file of [
      "ThermalPrint80mm.tsx",
      "ThermalReceiptCompact.tsx",
      "ModernThermalReceipt80mm.tsx",
      "TvsThermalReceipt80mm.tsx",
    ]) {
      const tsx = source(file);
      expect(tsx, file).toContain("resolveInvoiceUpiId");
      expect(tsx, file).not.toMatch(/bill_barcode_settings\?\.upi_id/);
    }
  });

  it("does not change QR pixel size in InvoiceWrapper generation", () => {
    const tsx = source("InvoiceWrapper.tsx");
    expect(tsx).toContain("width: 200");
  });
});
