import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RetailERPTemplate } from "./RetailERPTemplate";
import { LETTERPAD_COMPOSITION_DECLARATION } from "@/utils/retailErpInvoicePrint";

const baseProps = {
  businessName: "SEMME",
  address: "Kharghar",
  mobile: "8879165040",
  invoiceNumber: "POS/26-27/35",
  invoiceDate: new Date("2026-09-17T13:00:00+05:30"),
  customerName: "Walk-in Customer",
  items: [
    {
      sr: 1,
      particulars: "BOXER BRIEF-1017-UNDE",
      size: "M",
      barcode: "8901336170034",
      hsn: "",
      qty: 1,
      rate: 599,
      mrp: 599,
      gstPercent: 0,
      amount: 599,
    },
  ],
  subtotal: 599,
  discount: 0,
  taxableAmount: 599,
  cgstAmount: 0,
  sgstAmount: 0,
  igstAmount: 0,
  totalTax: 0,
  roundOff: 0,
  grandTotal: 599,
  taxType: "no_gst",
  termsConditions: [
    "GOODS ONCE SOLD WILL NOT BE TAKEN BACK.",
    "NO EXCHANGE WITHOUT BARCODE & BILL.",
  ],
};

describe("letter-pad (preprinted) Note section", () => {
  it("prints the composition declaration under Note:", () => {
    const html = renderToStaticMarkup(
      createElement(RetailERPTemplate, {
        ...baseProps,
        variant: "preprinted",
        format: "a4",
      }),
    );
    expect(html).toContain("Note:");
    expect(html).toContain(LETTERPAD_COMPOSITION_DECLARATION);
    expect(html).toContain("Terms &amp; Conditions:");
    expect(html).toContain("GOODS ONCE SOLD WILL NOT BE TAKEN BACK.");
  });

  it("does not inject the declaration into standard Retail ERP when Note is empty", () => {
    const html = renderToStaticMarkup(
      createElement(RetailERPTemplate, {
        ...baseProps,
        variant: "standard",
        format: "a4",
      }),
    );
    expect(html).toContain("Note:");
    expect(html).not.toContain(LETTERPAD_COMPOSITION_DECLARATION);
  });
});
