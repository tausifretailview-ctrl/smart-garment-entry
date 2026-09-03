export function publicStorefrontUrl(origin: string, orgSlug: string): string {
  const base = String(origin || "").replace(/\/+$/, "");
  const slug = String(orgSlug || "").trim().replace(/^\/+|\/+$/g, "");
  if (!base || !slug) return "";
  return `${base}/${slug}/store`;
}

export function publicStorefrontProductUrl(
  origin: string,
  orgSlug: string,
  productId: string,
): string {
  const home = publicStorefrontUrl(origin, orgSlug);
  const id = String(productId || "").trim();
  if (!home || !id) return "";
  return `${home}/p/${id}`;
}

/** Digits-only WhatsApp id. Strips leading 00; keeps country code when present. */
export function normalizeWhatsAppPhone(phone: string | null | undefined): string {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("00")) return digits.slice(2);
  return digits;
}

export function whatsappShareUrl(text: string, phone?: string | null): string {
  const encoded = encodeURIComponent(text);
  const digits = normalizeWhatsAppPhone(phone);
  if (digits) return `https://wa.me/${digits}?text=${encoded}`;
  return `https://wa.me/?text=${encoded}`;
}

/** Accept a full URL, instagram.com/handle, or @handle. */
export function normalizeInstagramUrl(raw: string | null | undefined): string | null {
  const v = String(raw || "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const handle = v
    .replace(/^@/, "")
    .replace(/^(www\.)?instagram\.com\//i, "")
    .replace(/\/+$/, "");
  if (!handle) return null;
  return `https://instagram.com/${handle}`;
}

export function storefrontWhatsAppShareText(shopName: string, storeUrl: string): string {
  const name = shopName.trim() || "our shop";
  return `See products from ${name}: ${storeUrl}`;
}

export function productEnquiryWhatsAppText(
  shopName: string,
  productName: string,
  productUrl: string,
): string {
  const shop = shopName.trim() || "your shop";
  const product = productName.trim() || "this product";
  return `Hi ${shop}, I am interested in ${product}. ${productUrl}`.trim();
}
