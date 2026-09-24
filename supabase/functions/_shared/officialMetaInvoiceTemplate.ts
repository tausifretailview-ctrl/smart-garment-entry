/**
 * Official Meta (Cloud API) invoice template.
 * Text body only — no IMAGE header — so the shop logo is not sent.
 * Shop name, address, and contact come from Company Profile at send time.
 */

export const OFFICIAL_META_INVOICE_TEMPLATE_NAME = "invoice_shop_details";

export const OFFICIAL_META_INVOICE_TEMPLATE_LANGUAGE = "en_US";

/** Positional body. Must not start or end with a variable (Meta rejects that). */
export const OFFICIAL_META_INVOICE_TEMPLATE_BODY = [
  "👋 Hello {{1}},",
  "",
  "Thank you for your purchase.",
  "",
  "🏪 Shop: {{2}}",
  "📍 Address: {{3}}",
  "📞 Contact: {{4}}",
  "",
  "🧾 Invoice Number: {{5}}",
  "💰 Amount: ₹{{6}}",
  "",
  "🔗 Download your invoice: {{7}}",
  "",
  "🙏 Thank you for shopping with us.",
].join("\n");

export const OFFICIAL_META_INVOICE_TEMPLATE_PARAMS = [
  { index: 1, field: "customer_name", label: "Customer Name" },
  { index: 2, field: "organization_name", label: "Shop Name" },
  { index: 3, field: "shop_address", label: "Shop Address" },
  { index: 4, field: "contact_number", label: "Contact Number" },
  { index: 5, field: "invoice_number", label: "Invoice Number" },
  { index: 6, field: "amount", label: "Amount" },
  { index: 7, field: "invoice_link", label: "Invoice Link" },
] as const;

/** Example values required by Meta when the template is submitted. */
export const OFFICIAL_META_INVOICE_TEMPLATE_EXAMPLES = [
  "TEST2",
  "VASTRAKALA SAREES & LADIES WEAR",
  "Main Road, City",
  "9876543210",
  "POS/26-27/12",
  "350",
  "https://app.inventoryshop.in/i/example",
];

const MISSING_SHOP_FIELD = "Not provided";

export type ShopIdentitySettings = {
  business_name?: string | null;
  address?: string | null;
  mobile_number?: string | null;
  owner_phone?: string | null;
};

/** Meta rejects template parameter values that contain newlines, tabs, or long space runs. */
export function sanitizeWhatsAppTemplateParam(
  value: unknown,
  fallback = MISSING_SHOP_FIELD,
): string {
  const text = String(value ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/ {2,}/g, " ")
    .trim();
  return text || fallback;
}

export function resolveShopAddress(
  saleData: Record<string, unknown>,
  shop?: ShopIdentitySettings | null,
): string {
  return sanitizeWhatsAppTemplateParam(
    saleData.shop_address || saleData.address || shop?.address || "",
  );
}

export function resolveShopContactNumber(
  saleData: Record<string, unknown>,
  shop?: ShopIdentitySettings | null,
): string {
  return sanitizeWhatsAppTemplateParam(
    saleData.contact_number ||
      saleData.shop_contact ||
      shop?.mobile_number ||
      shop?.owner_phone ||
      "",
  );
}

export function applyShopIdentityToSaleData(
  saleData: Record<string, unknown>,
  shop?: ShopIdentitySettings | null,
): Record<string, unknown> {
  return {
    ...saleData,
    shop_address: resolveShopAddress(saleData, shop),
    contact_number: resolveShopContactNumber(saleData, shop),
  };
}

export function invoiceTemplateOmitsShopLogo(templateName: string | null | undefined): boolean {
  return String(templateName ?? "").trim().toLowerCase() === OFFICIAL_META_INVOICE_TEMPLATE_NAME;
}

export function buildOfficialMetaInvoiceTemplateComponents(): Array<Record<string, unknown>> {
  return [
    {
      type: "BODY",
      text: OFFICIAL_META_INVOICE_TEMPLATE_BODY,
      example: {
        body_text: [OFFICIAL_META_INVOICE_TEMPLATE_EXAMPLES],
      },
    },
  ];
}

export function buildOfficialMetaInvoiceTemplateCreateBody(): Record<string, unknown> {
  return {
    name: OFFICIAL_META_INVOICE_TEMPLATE_NAME,
    language: OFFICIAL_META_INVOICE_TEMPLATE_LANGUAGE,
    category: "UTILITY",
    parameter_format: "POSITIONAL",
    components: buildOfficialMetaInvoiceTemplateComponents(),
  };
}

export function normalizeMetaTemplateBody(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

export function metaTemplateBodyText(components: unknown): string {
  if (!Array.isArray(components)) return "";
  const body = components.find(
    (component) => String((component as { type?: string })?.type ?? "").toUpperCase() === "BODY",
  ) as { text?: string } | undefined;
  return String(body?.text ?? "");
}

export function metaTemplateHasImageHeader(components: unknown): boolean {
  if (!Array.isArray(components)) return false;
  return components.some((component) => {
    const row = component as { type?: string; format?: string };
    return String(row?.type ?? "").toUpperCase() === "HEADER" &&
      String(row?.format ?? "").toUpperCase() === "IMAGE";
  });
}

export function officialMetaInvoiceTemplateIsReady(input: {
  status?: string | null;
  components?: unknown;
}): boolean {
  const status = String(input.status ?? "").trim().toUpperCase();
  if (status !== "APPROVED") return false;
  if (metaTemplateHasImageHeader(input.components)) return false;
  return normalizeMetaTemplateBody(metaTemplateBodyText(input.components)) ===
    normalizeMetaTemplateBody(OFFICIAL_META_INVOICE_TEMPLATE_BODY);
}

export function isDuplicateWhatsAppTemplateError(message: string): boolean {
  const text = message.toLowerCase();
  return text.includes("already exists") ||
    text.includes("already english") ||
    text.includes("content for this template");
}

const NEWTEMP_SEVEN_PARAMETER_BODY = [
  "👋 Hello {{1}},",
  "",
  "🙏 Thank you for your purchase with {{2}}.",
  "",
  "🧾 Invoice Number: {{3}}",
  "💰 Invoice Amount: ₹{{4}}",
  "",
  "🔗 View Invoice: {{5}}",
  "📸 Instagram: {{6}}",
  "👥 Join our WhatsApp Group: {{7}}",
  "",
  "✨ Thank you for shopping with us.",
].join("\n");

/** Replace a media header with shop identity while preserving seven body placeholders and buttons. */
export function replaceTemplateLogoWithShopDetails(
  components: unknown,
  shop: { businessName: string; address: string },
): Array<Record<string, unknown>> {
  if (!Array.isArray(components)) {
    throw new Error("The selected Meta template has no editable components.");
  }

  const businessName = sanitizeWhatsAppTemplateParam(shop.businessName, "Our Shop");
  const address = sanitizeWhatsAppTemplateParam(shop.address);
  if (businessName.length > 60) {
    throw new Error("The shop name is too long for a Meta text header.");
  }

  const withoutHeader = components.filter((component) =>
    String((component as { type?: string })?.type ?? "").toUpperCase() !== "HEADER"
  ) as Array<Record<string, unknown>>;
  const bodyIndex = withoutHeader.findIndex((component) =>
    String(component?.type ?? "").toUpperCase() === "BODY"
  );
  if (bodyIndex < 0) {
    throw new Error("The selected Meta template has no message body.");
  }

  const body = withoutHeader[bodyIndex];
  const addressLine = `📍 ${address}`;
  const placeholderCount = (String(body.text ?? "").match(/\{\{\d+\}\}/g) ?? []).length;
  if (placeholderCount !== 7) {
    throw new Error("The selected Meta template must have exactly 7 body parameters.");
  }
  const updatedBody = { ...body, text: `${addressLine}\n\n${NEWTEMP_SEVEN_PARAMETER_BODY}` };
  const updated = [...withoutHeader];
  updated[bodyIndex] = updatedBody;

  return [
    { type: "HEADER", format: "TEXT", text: businessName },
    ...updated,
  ];
}

/** Sample message shown in WhatsApp settings (icons included, no logo). */
export function previewOfficialMetaInvoiceMessage(): string {
  let message = OFFICIAL_META_INVOICE_TEMPLATE_BODY;
  OFFICIAL_META_INVOICE_TEMPLATE_EXAMPLES.forEach((example, index) => {
    message = message.replace(`{{${index + 1}}}`, example);
  });
  return message;
}
