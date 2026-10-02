import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TallyTaxInvoiceTemplate } from "@/components/invoice-templates/TallyTaxInvoiceTemplate";

const financerDetails = {
  financer_name: "Bajaj Finserv",
  loan_number: "DSBS-99",
  tenure: 12,
  down_payment: 5000,
  down_payment_mode: "cash",
  emi_amount: 2200,
  bank_transfer_amount: 18000,
  finance_discount: 500,
};

function renderBill(itemCount: number) {
  return renderToStaticMarkup(
    React.createElement(TallyTaxInvoiceTemplate, {
      businessName: "REHMANI NX",
      address: "Market Road",
      mobile: "9999999999",
      gstNumber: "27AAAAA0000A1Z5",
      invoiceNumber: "POS/26-27/121",
      invoiceDate: new Date("2026-10-02"),
      customerName: "WALK IN",
      items: Array.from({ length: itemCount }, (_, i) => ({
        sr: i + 1,
        particulars: `KURTI ${i + 1}`,
        size: "M",
        barcode: "890000",
        hsn: "6204",
        sp: 1000,
        qty: 1,
        rate: 1000,
        total: 1000,
        gstPercent: 5,
      })),
      subtotal: itemCount * 1000,
      discount: 0,
      taxableAmount: itemCount * 1000,
      totalTax: 0,
      roundOff: 0,
      grandTotal: itemCount * 1000,
      paymentMethod: "multiple",
      financeAmount: itemCount * 1000,
      financerDetails,
      termsConditions: ["Goods once sold will not be taken back."],
    }),
  );
}

describe("TallyTaxInvoiceTemplate EMI markup", () => {
  it("prints Finance / EMI on a short bill and a full bill", () => {
    for (const count of [1, 18]) {
      const html = renderBill(count);
      expect(html).toContain("Finance / EMI Details");
      expect(html).toContain("Bajaj Finserv");
      expect(html).toContain("Monthly EMI");
      expect(html).toContain("2,200.00");
      expect(html).toContain("tally-finance-emi-block");
      expect(html).toContain("height:auto");
      expect(html).toContain("overflow:visible");
      expect(html).not.toMatch(/(?<!min-)height:297mm/);
    }
  });
});
