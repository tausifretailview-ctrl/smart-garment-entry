import { describe, expect, it } from "vitest";
import {
  buildEllaEnquiryWhatsAppText,
  buildEllaOrderWhatsAppText,
  ellaShopWhatsAppUrl,
  ellaWhatsAppNumber,
} from "./ellaWhatsApp";
import type { EllaCartLine } from "./ellaCart";

describe("ellaWhatsAppNumber", () => {
  it("adds 91 to bare Indian mobiles and keeps full international numbers", () => {
    expect(ellaWhatsAppNumber("9876543210")).toBe("919876543210");
    expect(ellaWhatsAppNumber("09876543210")).toBe("919876543210");
    expect(ellaWhatsAppNumber("+91 98765 43210")).toBe("919876543210");
    expect(ellaWhatsAppNumber("0091 98765 43210")).toBe("919876543210");
    expect(ellaWhatsAppNumber("+971 50 123 4567")).toBe("971501234567");
    expect(ellaWhatsAppNumber("")).toBe("");
    expect(ellaWhatsAppNumber(null)).toBe("");
  });

  it("returns no link when the shop has no number", () => {
    expect(ellaShopWhatsAppUrl("Hi", null)).toBeNull();
    expect(ellaShopWhatsAppUrl("Hi there", "9876543210")).toBe("https://wa.me/919876543210?text=Hi%20there");
  });
});

describe("WhatsApp order text", () => {
  const cart = [
    {
      key: "p1:M",
      productId: "p1",
      code: "EN-101",
      name: "Ivory anarkali",
      size: "M",
      qty: 1,
      price: 12000,
      priceLabel: "₹12,000",
    },
  ] as unknown as EllaCartLine[];

  it("lists the pieces, payment and delivery details", () => {
    const text = buildEllaOrderWhatsAppText({
      shopName: "Ella'Noor",
      orderRef: "EN-261008-01",
      cart,
      total: 12000,
      method: "advance",
      customer: { customerName: "Aisha", customerPhone: "9876543210", address: "12 Hill Road, Bandra", pincode: "400050" },
      upiReference: "123456789012",
    });
    expect(text).toContain("Hi Ella'Noor, I have placed an order");
    expect(text).toContain("*Order EN-261008-01*");
    expect(text).toContain("1. Ivory anarkali (EN-101) · Size M × 1 · ₹12,000");
    expect(text).toContain("Paid now:");
    expect(text).toContain("UPI ref: 123456789012");
    expect(text).toContain("PIN: 400050");
  });

  it("says booked when the customer paid, enquiry otherwise", () => {
    const base = { shopName: "Ella'Noor", customerName: "Aisha", customerPhone: "98765 43210" };
    expect(buildEllaEnquiryWhatsAppText({ ...base, product: { name: "Teal lehenga", code: "EN-9" }, paid: true })).toContain(
      "I have booked Teal lehenga (EN-9)",
    );
    expect(buildEllaEnquiryWhatsAppText({ ...base, product: null })).toContain("sent an enquiry for a studio visit");
  });
});
