import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Gurukrupa POS A5 invoice", () => {
  it("wires a Retail ERP variant with Sub Total / Discount / S/R / Bill Total and no Round Off", () => {
    const template = readFileSync(resolve(here, "./RetailERPTemplate.tsx"), "utf8");
    expect(template).toContain("const GURUKRUPA_SN_ROWS = 9");
    expect(template).toMatch(/isGurukrupa \? GURUKRUPA_SN_ROWS/);
    expect(template).toContain("Amount in Words");
    expect(template).toMatch(/\{\s*!isGurukrupa && \(/);
    expect(template).toMatch(/paymentMethod && !isRealTast && !isGurukrupa/);
    expect(template).toContain("isGurukrupa && paymentParts.length > 0");

    const wrapper = readFileSync(resolve(here, "../InvoiceWrapper.tsx"), "utf8");
    expect(wrapper).toContain("case 'gurukrupa'");
    expect(wrapper).toContain('variant="gurukrupa"');

    const picker = readFileSync(resolve(here, "../settings/InvoiceTemplateSelectItems.tsx"), "utf8");
    expect(picker).toContain('value="gurukrupa"');
    expect(picker).toContain("Gurukrupa");
  });

  it("shows Outstanding and Advance split from customer account (not a signed Prev Bal)", () => {
    const template = readFileSync(resolve(here, "./RetailERPTemplate.tsx"), "utf8");
    expect(template).toContain("gurukrupaInvoiceAccountLines");
    expect(template).toContain("<strong>Outstanding:</strong>");
    expect(template).toContain("<strong>Advance:</strong>");
    expect(template).toContain("<strong>Total Due:</strong>");
    expect(template).toContain("isGurukrupa ? (");
    expect(template).toMatch(/!isRealTast && !isZaika/);

    const dashboard = readFileSync(resolve(here, "../../pages/POSDashboard.tsx"), "utf8");
    expect(dashboard).toContain("fetchInvoicePrintAccountFacets");
    expect(dashboard).not.toMatch(
      /allSales\.reduce\(\(sum, s\) => sum \+ \(\(s\.net_amount \|\| 0\) - \(s\.paid_amount \|\| 0\)\)/,
    );

    const posSales = readFileSync(resolve(here, "../../pages/POSSales.tsx"), "utf8");
    expect(posSales).toContain("fetchInvoicePrintAccountFacets");
    expect(posSales).toContain("rate: billedUnit");
    expect(posSales).toContain("unusedAdvance");

    expect(template).toContain("retailErpLineDisplayRate");
    expect(template).toContain("billedUnitRate = isGurukrupa");
    expect(template).toMatch(/showSizeCol = .*!isGurukrupa/);
    expect(template).toContain('label: "SP"');
    expect(template).toContain('key: "salePrice"');
    expect(template).toContain("isGurukrupa && showQtyCol");
    expect(template).toMatch(/isGurukrupa\s*\?\s*"13%"/);
  });
});
