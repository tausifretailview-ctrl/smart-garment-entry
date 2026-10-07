import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RetailERPTemplate } from "./RetailERPTemplate";

const here = dirname(fileURLToPath(import.meta.url));

describe("Gurukrupa POS A5 invoice", () => {
  it("wires a Retail ERP variant with Sub Total / Discount / S/R / Bill Total and no Round Off", () => {
    const template = readFileSync(resolve(here, "./RetailERPTemplate.tsx"), "utf8");
    expect(template).toContain("const GURUKRUPA_SN_ROWS = 9");
    expect(template).toMatch(/isGurukrupa \? GURUKRUPA_SN_ROWS/);
    expect(template).toContain("Amount in Words");
    expect(template).toMatch(/\{\s*!isGurukrupa && \(/);
    expect(template).toMatch(/paymentMethod && !isRealTast && !isGurukrupa/);
    expect(template).toContain('data-gurukrupa-pay-row="received"');
    expect(template).toContain('data-gurukrupa-pay-row="account"');
    expect(template).toContain("gurukrupaTenderLine");

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

  it("prints Received, Cash, and Balance on one row and Outstanding, Advance, and Total Due on the next", () => {
    const html = renderToStaticMarkup(
      createElement(RetailERPTemplate, {
        businessName: "SHIVLAXMI PAITHANI",
        address: "Mumbai",
        mobile: "9853499304",
        invoiceNumber: "POS/26-27/1",
        invoiceDate: new Date("2026-10-05T14:15:00+05:30"),
        customerName: "AAMAN",
        items: [
          {
            sr: 1,
            particulars: "ANUSHREE SHIVS-PAI",
            size: "",
            barcode: "730001003",
            hsn: "",
            sp: 7500,
            qty: 1,
            rate: 7500,
            total: 7500,
          },
        ],
        subtotal: 7500,
        discount: 0,
        taxableAmount: 7500,
        cgstAmount: 0,
        sgstAmount: 0,
        igstAmount: 0,
        totalTax: 0,
        roundOff: 0,
        grandTotal: 7500,
        paidAmount: 7500,
        cashAmount: 7500,
        paymentMethod: "cash",
        previousBalance: 0,
        unusedAdvance: 0,
        taxType: "no_gst",
        variant: "gurukrupa",
        format: "a5-vertical",
      }) as ReactElement,
    );

    const received = html.split('data-gurukrupa-pay-row="received"')[1]?.split('data-gurukrupa-pay-row="account"')[0] ?? "";
    expect(received).toContain("Received:");
    expect(received).toContain("Cash:");
    expect(received).toContain("7,500.00");
    expect(received).toContain("Balance:");
    expect(received).not.toContain("Outstanding:");
    expect(received).not.toContain("Total Due:");

    const account = html.split('data-gurukrupa-pay-row="account"')[1]?.slice(0, 1200) ?? "";
    expect(account).toContain("Outstanding:");
    expect(account).toContain("Advance:");
    expect(account).toContain("Total Due:");
    expect(account.indexOf("Outstanding:")).toBeLessThan(account.indexOf("Advance:"));
    expect(account.indexOf("Advance:")).toBeLessThan(account.indexOf("Total Due:"));
  });
});
