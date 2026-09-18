import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { KlearA4Template } from "./KlearA4Template";
import { numberToWords } from "@/lib/utils";

const here = dirname(fileURLToPath(import.meta.url));

const sku = (
  name: string,
  hsn: string,
  gst: number,
  mrp: number,
  disc: number,
  rate: number,
  size: string,
  qty: number,
  sr: number,
) => ({
  sr,
  particulars: name,
  size,
  barcode: "",
  hsn,
  sp: mrp,
  mrp,
  qty,
  rate,
  total: Math.round(rate * qty * 100) / 100,
  gstPercent: gst,
  discountPercent: disc,
});

const items = [
  sku("1037 CAMEL", "64039990", 5, 3295, 28, 2372.4, "7", 1, 1),
  sku("1037 CAMEL", "64039990", 5, 3295, 28, 2372.4, "8", 1, 2),
  sku("1037 CAMEL", "64039990", 5, 3295, 28, 2372.4, "9", 1, 3),
  sku("1037 CAMEL", "64039990", 5, 3295, 28, 2372.4, "10", 1, 4),
  sku("1868 CAML", "64051000", 18, 4295, 28, 3092.4, "7", 1, 5),
  sku("1868 CAML", "64051000", 18, 4295, 28, 3092.4, "8", 2, 6),
  sku("1868 CAML", "64051000", 18, 4295, 28, 3092.4, "9", 2, 7),
  sku("1868 CAML", "64051000", 18, 4295, 28, 3092.4, "10", 1, 8),
];

describe("KlearA4Template", () => {
  it("pivots SKU lines into size columns and shows blended CGST/SGST, not per-rate rows", () => {
    const html = renderToStaticMarkup(
      createElement(KlearA4Template, {
        businessName: "SANJAY SHOES",
        address: "LATUR",
        mobile: "9890454514",
        gstNumber: "27AEVPB9782P1ZB",
        invoiceNumber: "74",
        invoiceDate: new Date(2026, 4, 14),
        customerName: "SAEEMA SHOES",
        customerGSTIN: "27AFGPT5177A1ZC",
        customerAddress: "1ST FLOOR CHANCHAL COMPLEX TILAK ROAD MAHAL NAGPUR 440032",
        items,
        discount: 0,
        cgstAmount: 4232.77,
        sgstAmount: 4232.77,
        roundOff: -0.1,
        grandTotal: 82382,
        sizeColumnHints: ["5", "6", "7", "8", "9", "10", "11", "12", "13"],
        bankDetails: {
          bank_name: "INDUS BANK",
          account_number: "650014122731",
          branch: "C A ROAD",
        },
        qrCodeUrl: "data:image/png;base64,qq==",
        showBankDetails: true,
      }),
    );

    expect(html).toContain("SANJAY SHOES");
    expect(html).toContain("SAEEMA SHOES");
    expect(html).toContain("Tax Invoice");
    expect(html).toContain("Credit Memo");
    expect(html).toContain("27-MAHARASHTRA");
    expect(html).toContain(">5</th>");
    expect(html).toContain(">13</th>");
    expect(html).toContain("1868 CAML");
    expect(html).toContain("1037 CAMEL");
    expect(html.match(/1868 CAML/g)?.length).toBe(1);
    expect(html).toContain("CGST");
    expect(html).toContain("SGST");
    expect(html).not.toContain("CGST 2.5%");
    expect(html).not.toContain("CGST 9.0%");
    expect(html).toContain("₹4,232.77");
    expect(html).toContain("SPL DISCOUNT");
    expect(html).toContain("INDUS BANK");
    expect(html).toContain("650014122731");
    expect(html).toContain(numberToWords(82382));
    expect(html).toContain("Amount in words");
    expect(html).not.toContain("Swipe");
    expect(html).not.toContain("digitally signed");
  });

  it("uses A4 page size with visible overflow", () => {
    const src = readFileSync(resolve(here, "./KlearA4Template.tsx"), "utf8");
    expect(src).toContain("size: A4 portrait");
    expect(src).toContain("overflow: visible !important");
    expect(src).not.toMatch(/@media print[\s\S]{0,400}overflow:\s*hidden/);
  });

  it("is registered as klear-a4 for every org on the A4 Sale/POS picker", () => {
    const wrapper = readFileSync(resolve(here, "../InvoiceWrapper.tsx"), "utf8");
    expect(wrapper).toContain("KlearA4Template");
    expect(wrapper).toContain("case 'klear-a4'");
    const picker = readFileSync(resolve(here, "../settings/InvoiceTemplateSelectItems.tsx"), "utf8");
    expect(picker).toContain('value="klear-a4"');
    expect(picker).toContain("Klear A4");
    expect(picker).toMatch(/<SelectLabel>A4 Size<\/SelectLabel>[\s\S]*value="klear-a4"/);
    expect(picker).not.toMatch(/organization_id|orgSlug|org_id/);
    const posForm = readFileSync(resolve(here, "../settings/PosSettingsForm.tsx"), "utf8");
    expect(posForm).toContain("InvoiceTemplateSelectItems");
    expect(posForm).not.toContain('paperGroups={posThermal ? "thermal-80mm" : "all"}');
    const printFormat = readFileSync(resolve(here, "../../utils/invoicePrintFormat.ts"), "utf8");
    expect(printFormat).toContain("'klear-a4'");
  });
});
