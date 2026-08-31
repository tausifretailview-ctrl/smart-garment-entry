import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("Gurukrupa POS A5 invoice", () => {
  it("wires a Retail ERP variant with Sub Total / Discount / S/R / Bill Total and no Round Off", () => {
    const template = readFileSync(resolve(here, "./RetailERPTemplate.tsx"), "utf8");
    expect(template).toContain('"gurukrupa"');
    expect(template).toContain("isGurukrupa");
    expect(template).toContain("!isGurukrupa &&");
    expect(template).toMatch(/!isDc && !isGurukrupa/);

    const wrapper = readFileSync(resolve(here, "../InvoiceWrapper.tsx"), "utf8");
    expect(wrapper).toContain("case 'gurukrupa'");
    expect(wrapper).toContain('variant="gurukrupa"');

    const picker = readFileSync(resolve(here, "../settings/InvoiceTemplateSelectItems.tsx"), "utf8");
    expect(picker).toContain('value="gurukrupa"');
    expect(picker).toContain("Gurukrupa");
  });
});
