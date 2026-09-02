import { describe, expect, it } from "vitest";
import {
  SALE_INVOICE_PREVIEW_FIELDS,
  SALE_INVOICE_PREVIEW_SELECT,
  buildSaleWhatsAppMessage,
  resolveSaleWhatsAppPhone,
} from "./mobileInvoicePreviewData";

describe("SALE_INVOICE_PREVIEW_SELECT", () => {
  it("loads credit_applied from sales, never the missing credit_amount column", () => {
    expect(SALE_INVOICE_PREVIEW_FIELDS).toContain("credit_applied");
    expect(SALE_INVOICE_PREVIEW_FIELDS).not.toContain("credit_amount");
    for (const col of SALE_INVOICE_PREVIEW_FIELDS) {
      expect(SALE_INVOICE_PREVIEW_SELECT.includes(col)).toBe(true);
    }
    expect(SALE_INVOICE_PREVIEW_SELECT).not.toMatch(/\bcredit_amount\b/);
    expect(SALE_INVOICE_PREVIEW_SELECT).toContain("customers:customer_id (gst_number, phone)");
  });
});

describe("resolveSaleWhatsAppPhone", () => {
  it("uses the sale snapshot, then the customer record", () => {
    expect(resolveSaleWhatsAppPhone({ customer_phone: "9876543210" })).toBe("9876543210");
    expect(
      resolveSaleWhatsAppPhone({
        customer_phone: "",
        customers: { phone: "+91 98765 43210" },
      }),
    ).toBe("+91 98765 43210");
    expect(resolveSaleWhatsAppPhone({ customer_phone: "123" })).toBe(null);
    expect(resolveSaleWhatsAppPhone({ customer_phone: null })).toBe(null);
  });
});

describe("buildSaleWhatsAppMessage", () => {
  it("builds a plain-text invoice message for wa.me encoding", () => {
    const message = buildSaleWhatsAppMessage({
      id: "abc",
      sale_number: "POS/26-27/285",
      net_amount: 520,
      customer_name: "AAMAN",
    });
    expect(message).toContain("Invoice POS/26-27/285");
    expect(message).toContain("AAMAN");
    expect(message).toContain("\n");
    expect(message).not.toContain("%0A");
  });
});
