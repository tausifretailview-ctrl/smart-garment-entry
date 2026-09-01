import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildMobilePosWhatsAppMessage,
  formatMobilePosInvoiceDate,
  formatMobilePosPaymentLabel,
  hasMobilePosWhatsAppPhone,
} from "./mobilePosWhatsAppMessage";

const here = dirname(fileURLToPath(import.meta.url));

describe("formatMobilePosInvoiceDate", () => {
  it("formats dd/MM/yyyy", () => {
    expect(formatMobilePosInvoiceDate(new Date(2026, 8, 1))).toBe("01/09/2026");
  });
});

describe("formatMobilePosPaymentLabel", () => {
  it("labels single methods", () => {
    expect(formatMobilePosPaymentLabel("cash")).toBe("Cash");
    expect(formatMobilePosPaymentLabel("card")).toBe("Card");
    expect(formatMobilePosPaymentLabel("upi")).toBe("UPI");
    expect(formatMobilePosPaymentLabel("pay_later")).toBe("Pay later");
  });

  it("summarizes mix breakdown", () => {
    expect(
      formatMobilePosPaymentLabel("multiple", {
        cashAmount: 100,
        cardAmount: 0,
        upiAmount: 50.5,
      }),
    ).toBe("Mix (Cash ₹100.00, UPI ₹50.50)");
  });
});

describe("buildMobilePosWhatsAppMessage", () => {
  it("includes invoice essentials and public view URL", () => {
    const message = buildMobilePosWhatsAppMessage({
      invoiceNo: "POS/26-27/12",
      invoiceDateLabel: "01/09/2026",
      netAmount: 1234.5,
      paymentLabel: "Cash",
      publicInvoiceUrl: "https://app.inventoryshop.in/demo/invoice/view/abc?format=thermal",
    });
    expect(message).toBe(
      [
        "Invoice: POS/26-27/12",
        "Date: 01/09/2026",
        "Amount: ₹1,234.50",
        "Payment: Cash",
        "",
        "View invoice: https://app.inventoryshop.in/demo/invoice/view/abc?format=thermal",
      ].join("\n"),
    );
  });

  it("omits view line when URL is empty", () => {
    const message = buildMobilePosWhatsAppMessage({
      invoiceNo: "POS/1",
      invoiceDateLabel: "01/09/2026",
      netAmount: 10,
      paymentLabel: "Pay later",
      publicInvoiceUrl: "",
    });
    expect(message).not.toContain("View invoice");
    expect(message).toContain("Payment: Pay later");
  });
});

describe("hasMobilePosWhatsAppPhone", () => {
  it("requires at least 10 digits", () => {
    expect(hasMobilePosWhatsAppPhone(null)).toBe(false);
    expect(hasMobilePosWhatsAppPhone("123")).toBe(false);
    expect(hasMobilePosWhatsAppPhone("9876543210")).toBe(true);
    expect(hasMobilePosWhatsAppPhone("+91 98765 43210")).toBe(true);
  });
});

describe("MobilePosBilling WhatsApp wiring", () => {
  it("uses AdaptiveCustomerPicker, wa.me send hook, and the compact template", () => {
    const source = readFileSync(resolve(here, "../pages/mobile/MobilePosBilling.tsx"), "utf8");
    expect(source).toContain("AdaptiveCustomerPicker");
    expect(source).toContain("useWhatsAppSend");
    expect(source).toContain("buildMobilePosWhatsAppMessage");
    expect(source).toContain("buildPublicInvoiceViewUrl");
    expect(source).toContain("Send via WhatsApp");
    expect(source).toContain("hasMobilePosWhatsAppPhone");
    expect(source).not.toMatch(
      /customerName:\s*"Walk in Customer",\s*customerId:\s*null,\s*customerPhone:\s*null/,
    );
  });
});
