import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("preprinted letterhead logo wiring", () => {
  it("renders the logo band only behind the opt-in helper", () => {
    const template = readFileSync(
      join(here, "../src/components/invoice-templates/RetailERPTemplate.tsx"),
      "utf8",
    );
    expect(template).toContain("shouldPrintPreprintedLetterheadLogo");
    expect(template).toContain("data-preprinted-letterhead-logo");
    expect(template).toContain("retail-erp-preprinted-letterhead-logo");
    expect(template).toContain("{showPreprintedLetterheadLogo && (");
    expect(template).toContain("{!isPreprinted && (");
  });

  it("passes the sale_settings flag through InvoiceWrapper", () => {
    const wrapper = readFileSync(
      join(here, "../src/components/InvoiceWrapper.tsx"),
      "utf8",
    );
    expect(wrapper).toContain("resolvePrintLogoOnPreprintedLetterhead");
    expect(wrapper).toContain("printLogoOnPreprintedLetterhead:");
  });

  it("exposes the switch on Sale and POS when Preprinted Invoice is selected", () => {
    const sale = readFileSync(join(here, "../src/pages/Settings.tsx"), "utf8");
    const pos = readFileSync(
      join(here, "../src/components/settings/PosSettingsForm.tsx"),
      "utf8",
    );
    expect(sale).toContain('id="print_logo_on_preprinted_letterhead"');
    expect(sale).toContain('=== "retail-erp-preprinted"');
    expect(pos).toContain('id="pos_print_logo_on_preprinted_letterhead"');
    expect(pos).toContain('resolvedPosTemplate === "retail-erp-preprinted"');
  });
});
