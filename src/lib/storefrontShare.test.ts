import { describe, expect, it } from "vitest";
import {
  normalizeInstagramUrl,
  normalizeWhatsAppPhone,
  productEnquiryWhatsAppText,
  publicStorefrontProductUrl,
  publicStorefrontUrl,
  storefrontWhatsAppShareText,
  whatsappShareUrl,
} from "./storefrontShare";

describe("storefrontShare", () => {
  it("builds the public store URL from origin + org slug", () => {
    expect(publicStorefrontUrl("https://app.inventoryshop.in", "ella-noor")).toBe(
      "https://app.inventoryshop.in/ella-noor/store",
    );
    expect(publicStorefrontUrl("https://app.inventoryshop.in/", "/demo/")).toBe(
      "https://app.inventoryshop.in/demo/store",
    );
    expect(publicStorefrontUrl("", "demo")).toBe("");
  });

  it("builds a product deep link", () => {
    expect(
      publicStorefrontProductUrl("https://app.inventoryshop.in", "demo", "aaaa"),
    ).toBe("https://app.inventoryshop.in/demo/store/p/aaaa");
  });

  it("normalizes WhatsApp numbers and builds click-to-chat links", () => {
    expect(normalizeWhatsAppPhone("+91 98765 43210")).toBe("919876543210");
    // An Indian 10-digit mobile needs 91 in front, or wa.me says the number is invalid.
    expect(whatsappShareUrl("Hello", "9876543210")).toBe(
      "https://wa.me/919876543210?text=Hello",
    );
    expect(normalizeWhatsAppPhone("09876543210")).toBe("919876543210");
    expect(normalizeWhatsAppPhone("0091 98765 43210")).toBe("919876543210");
    expect(normalizeWhatsAppPhone("+1 415 555 0100")).toBe("14155550100");
    expect(whatsappShareUrl("See our products: https://x/y")).toContain("https://wa.me/?text=");
  });

  it("normalizes Instagram handles and URLs", () => {
    expect(normalizeInstagramUrl("@ella.noor")).toBe("https://instagram.com/ella.noor");
    expect(normalizeInstagramUrl("instagram.com/ella.noor/")).toBe("https://instagram.com/ella.noor");
    expect(normalizeInstagramUrl("https://instagram.com/ella.noor")).toBe("https://instagram.com/ella.noor");
    expect(normalizeInstagramUrl("")).toBeNull();
  });

  it("builds share and enquiry text", () => {
    expect(storefrontWhatsAppShareText("Ella Noor", "https://app.inventoryshop.in/ella-noor/store")).toBe(
      "See products from Ella Noor: https://app.inventoryshop.in/ella-noor/store",
    );
    expect(productEnquiryWhatsAppText("Ella Noor", "Silk Saree", "https://x/p/1")).toContain(
      "Silk Saree",
    );
  });
});
