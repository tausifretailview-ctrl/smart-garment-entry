import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RetailERPTemplate } from "./RetailERPTemplate";

// POS bill: 23 × ₹980 at 5% GST (Emage A5 report, POS/26-27/36).
function renderA5(opts: {
  taxType: "inclusive" | "exclusive";
  lineTotal: number;
  grandTotal: number;
  cgst: number;
}) {
  return renderToStaticMarkup(
    createElement(RetailERPTemplate, {
      businessName: "EMAGE DESIGNER STUDIO",
      address: "Santacruz West",
      mobile: "7045332359",
      invoiceNumber: "POS/26-27/36",
      invoiceDate: new Date("2026-10-08T12:38:00+05:30"),
      customerName: "STATE BANK OF INDIA",
      items: [
        {
          sr: 1,
          particulars: "BEDSHEET VIBRANT",
          size: "",
          barcode: "540001973",
          hsn: "62113",
          sp: 980,
          mrp: 980,
          qty: 23,
          rate: 980,
          total: opts.lineTotal,
          gstPercent: 5,
          discountPercent: 0,
        },
      ],
      subtotal: 22540,
      discount: 0,
      taxableAmount: 0,
      cgstAmount: opts.cgst,
      sgstAmount: opts.cgst,
      igstAmount: 0,
      totalTax: opts.cgst * 2,
      roundOff: 0,
      grandTotal: opts.grandTotal,
      taxType: opts.taxType,
      format: "a5-vertical",
      paymentMethod: "pay_later",
    }) as ReactElement,
  );
}

function roundOffRow(html: string): string {
  const at = html.indexOf("Round Off</span>");
  return at < 0 ? "" : html.slice(at, at + 120);
}

describe("Retail ERP A5 GST vs Round Off", () => {
  it("inclusive bill does not add GST and cancel it in Round Off", () => {
    const html = renderA5({ taxType: "inclusive", lineTotal: 22540, grandTotal: 22540, cgst: 536.67 });
    expect(html).toContain("GST Amount (Incl.)");
    expect(html).not.toContain("+ ₹1,073.34");
    expect(roundOffRow(html)).not.toContain("1,073");
    expect(html).toContain("₹22,540.00");
  });

  it("exclusive bill adds GST on top of rate × qty with no round off", () => {
    // POS exclusive print lines carry taxable + GST; bill = 22,540 + 1,127.
    const html = renderA5({ taxType: "exclusive", lineTotal: 23667, grandTotal: 23667, cgst: 563.5 });
    expect(html).toContain("+ ₹1,127.00");
    expect(html).not.toContain("(Incl.)");
    expect(roundOffRow(html)).not.toContain("1,127");
    expect(html).toContain("₹23,667.00");
  });
});
