import { describe, expect, it } from "vitest";
import {
  OFFICIAL_META_INVOICE_TEMPLATE_BODY,
  OFFICIAL_META_INVOICE_TEMPLATE_NAME,
  OFFICIAL_META_INVOICE_TEMPLATE_PARAMS,
  applyShopIdentityToSaleData,
  buildOfficialMetaInvoiceTemplateCreateBody,
  invoiceTemplateOmitsShopLogo,
  isDuplicateWhatsAppTemplateError,
  metaTemplateHasImageHeader,
  officialMetaInvoiceTemplateIsReady,
  previewOfficialMetaInvoiceMessage,
  resolveShopAddress,
  resolveShopContactNumber,
  sanitizeWhatsAppTemplateParam,
} from "../supabase/functions/_shared/officialMetaInvoiceTemplate.ts";

describe("official Meta invoice template", () => {
  it("is a text body with shop name, address, contact, and icons, and no image header", () => {
    const payload = buildOfficialMetaInvoiceTemplateCreateBody();
    const components = payload.components as Array<{ type: string; format?: string; text?: string }>;

    expect(payload.name).toBe(OFFICIAL_META_INVOICE_TEMPLATE_NAME);
    expect(payload.category).toBe("UTILITY");
    expect(components).toHaveLength(1);
    expect(components[0].type).toBe("BODY");
    expect(components.some((component) => component.format === "IMAGE")).toBe(false);
    expect(metaTemplateHasImageHeader(components)).toBe(false);

    const body = String(components[0].text);
    expect(body.startsWith("{{")).toBe(false);
    expect(body.trimEnd().endsWith("}}")).toBe(false);
    expect(body).toContain("🏪 Shop: {{2}}");
    expect(body).toContain("📍 Address: {{3}}");
    expect(body).toContain("📞 Contact: {{4}}");
    expect(body).toContain("🧾 Invoice Number: {{5}}");
    expect(body).toContain("💰 Amount: ₹{{6}}");
    expect(body).toContain("🔗 Download your invoice: {{7}}");
    expect(OFFICIAL_META_INVOICE_TEMPLATE_PARAMS.map((param) => param.field)).toEqual([
      "customer_name",
      "organization_name",
      "shop_address",
      "contact_number",
      "invoice_number",
      "amount",
      "invoice_link",
    ]);
  });

  it("fills shop address and contact from company profile and collapses newlines", () => {
    expect(sanitizeWhatsAppTemplateParam(" 12 Main\nRoad\t")).toBe("12 Main Road");
    expect(resolveShopAddress({}, { address: "" })).toBe("Not provided");
    expect(resolveShopContactNumber({}, { mobile_number: "", owner_phone: "9876543210" })).toBe(
      "9876543210",
    );

    const enriched = applyShopIdentityToSaleData(
      { customer_name: "TEST2" },
      {
        business_name: "VASTRAKALA SAREES & LADIES WEAR",
        address: "Shop 4\nMarket Road",
        mobile_number: "9876543210",
      },
    );
    expect(enriched.shop_address).toBe("Shop 4 Market Road");
    expect(enriched.contact_number).toBe("9876543210");
  });

  it("treats only the shop-details template as logo-free", () => {
    expect(invoiceTemplateOmitsShopLogo("invoice_shop_details")).toBe(true);
    expect(invoiceTemplateOmitsShopLogo(" Invoice_Shop_Details ")).toBe(true);
    expect(invoiceTemplateOmitsShopLogo("invoice_1")).toBe(false);
  });

  it("is ready only when Meta approved the text body without an image header", () => {
    expect(officialMetaInvoiceTemplateIsReady({
      status: "APPROVED",
      components: [{ type: "BODY", text: OFFICIAL_META_INVOICE_TEMPLATE_BODY }],
    })).toBe(true);
    expect(officialMetaInvoiceTemplateIsReady({
      status: "PENDING",
      components: [{ type: "BODY", text: OFFICIAL_META_INVOICE_TEMPLATE_BODY }],
    })).toBe(false);
    expect(officialMetaInvoiceTemplateIsReady({
      status: "APPROVED",
      components: [
        { type: "HEADER", format: "IMAGE" },
        { type: "BODY", text: OFFICIAL_META_INVOICE_TEMPLATE_BODY },
      ],
    })).toBe(false);
    expect(isDuplicateWhatsAppTemplateError(
      "There is already English (US) content for this template",
    )).toBe(true);
  });

  it("preview shows icons and shop details instead of a logo", () => {
    const preview = previewOfficialMetaInvoiceMessage();
    expect(preview).toContain("👋 Hello TEST2,");
    expect(preview).toContain("🏪 Shop: VASTRAKALA SAREES & LADIES WEAR");
    expect(preview).toContain("📍 Address: Main Road, City");
    expect(preview).toContain("📞 Contact: 9876543210");
    expect(preview).toContain("🧾 Invoice Number: POS/26-27/12");
    expect(preview).toContain("💰 Amount: ₹350");
    expect(preview).not.toContain("{{");
  });
});
