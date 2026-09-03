import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Gurukrupa POS A5 invoice", () => {
  it("wires a Retail ERP variant with Sub Total / Discount / S/R / Bill Total and no Round Off", () => {
    const template = readFileSync(resolve(here, "./RetailERPTemplate.tsx"), "utf8");
    expect(template).toContain("const GURUKRUPA_SN_ROWS = 10");
    expect(template).toMatch(/isGurukrupa \? GURUKRUPA_SN_ROWS/);
    expect(template).toContain("Amount in Words");
    expect(template).toMatch(/\{\s*!isGurukrupa && \(/);
    expect(template).toMatch(/paymentMethod && !isRealTast && !isGurukrupa/);

    const wrapper = readFileSync(resolve(here, "../InvoiceWrapper.tsx"), "utf8");
    expect(wrapper).toContain("case 'gurukrupa'");
    expect(wrapper).toContain('variant="gurukrupa"');

    const picker = readFileSync(resolve(here, "../settings/InvoiceTemplateSelectItems.tsx"), "utf8");
    expect(picker).toContain('value="gurukrupa"');
    expect(picker).toContain("Gurukrupa");
  });

  it("shows Prev Bal and Total Due from customer account (not Zaika-hidden)", () => {
    const template = readFileSync(resolve(here, "./RetailERPTemplate.tsx"), "utf8");
    expect(template).toContain("invoiceTotalDue");
    expect(template).toContain("<strong>Prev Bal:</strong>");
    expect(template).toContain("<strong>Total Due:</strong>");
    expect(template).toMatch(/!isRealTast && !isZaika/);
    expect(template).not.toMatch(/!isGurukrupa &&[\s\S]{0,80}Prev Bal/);

    const dashboard = readFileSync(resolve(here, "../../pages/POSDashboard.tsx"), "utf8");
    expect(dashboard).toContain("invoicePreviousBalanceFromAccount");
    expect(dashboard).toContain("fetchCustomerAccountStateView");
    expect(dashboard).not.toMatch(
      /allSales\.reduce\(\(sum, s\) => sum \+ \(\(s\.net_amount \|\| 0\) - \(s\.paid_amount \|\| 0\)\)/,
    );
  });
});
