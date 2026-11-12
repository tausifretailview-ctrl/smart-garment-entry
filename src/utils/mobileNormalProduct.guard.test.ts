import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, "../components/ProductEntryDialog.tsx"), "utf8");

describe("Mobile ERP 'Normal product' button (Add New Product)", () => {
  it("is shown after Service only when Mobile ERP is on", () => {
    expect(src).toContain("{mobileERPMode?.enabled && (");
    expect(src).toContain(">Normal product</span>");
    expect(src.indexOf("label: 'Service'")).toBeLessThan(src.indexOf(">Normal product</span>"));
  });

  it("saves as goods with IMEI off and hides the IMEI switch", () => {
    expect(src).toContain('product_type: "goods",\n                          requires_imei: false,');
    expect(src).toContain('formData.product_type !== "service" && !mobileLocalItem && (');
  });

  it("always generates a barcode when none was typed", () => {
    expect(src).toContain("(hideOpeningQty && isAutoBarcode) || masterOnly || (mobileERPMode?.enabled && mobileLocalItem)");
  });
});
