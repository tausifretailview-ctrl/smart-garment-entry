// What push-send puts in a customer notification (FCM data, all strings). Pure helpers, no
// Deno APIs, so Vitest covers them. The customer app's service worker turns these fields into
// the notification (src/customer/lib/pushDisplay.ts): shop logo as icon, the offer photo as a
// large picture, the offer code in the text, and a WhatsApp button.

export type CustomerPushShop = { name: string; logo_url: string | null; whatsapp: string | null };

const DAY = 86_400;
/** FCM's own maximum (and default): 28 days. */
const MAX_TTL = 28 * DAY;

function httpsOrEmpty(url: string | null | undefined): string {
  const v = String(url ?? "").trim();
  return /^https:\/\//i.test(v) && v.length <= 500 ? v : "";
}

/** Bill notification text: names the shop, since the phone only shows the site address. */
export function invoicePushText(input: {
  shopName: string;
  saleNumber: string;
  netAmount: number | null | undefined;
  totalQty?: number | null;
}): { title: string; body: string } {
  const amount = Number(input.netAmount ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });
  const qty = Number(input.totalQty ?? 0);
  const items = qty > 0 ? ` · ${qty} item${qty === 1 ? "" : "s"}` : "";
  const shop = input.shopName.trim();
  return {
    title: shop ? `🧾 Thank you for shopping at ${shop}` : `🧾 Your bill ${input.saleNumber}`,
    body: `Bill ${input.saleNumber} · ₹${amount}${items}. Tap to view, download or share your bill.`,
  };
}

/**
 * How long FCM keeps trying a phone that is off or offline. Offers stop at the end of their
 * valid-till day (an expired offer arriving late is worse than none); bills keep FCM's 28 days.
 */
export function pushTtlSeconds(
  kind: "invoice" | "offer",
  validTill: string | null | undefined,
  now: Date = new Date(),
): number {
  if (kind === "invoice") return MAX_TTL;
  if (!validTill || !/^\d{4}-\d{2}-\d{2}$/.test(validTill)) return 7 * DAY;
  // End of the valid-till day in India (UTC+5:30).
  const end = Date.parse(`${validTill}T23:59:59+05:30`);
  const secs = Math.floor((end - now.getTime()) / 1000);
  return Math.min(MAX_TTL, Math.max(3600, secs));
}

/** Extra FCM data fields for a rich notification. Empty values are left out. */
export function richPushData(input: {
  kind: "invoice" | "offer";
  shop: CustomerPushShop | null;
  imageUrl?: string | null;
  offerCode?: string | null;
}): Record<string, string> {
  const out: Record<string, string> = { kind: input.kind };
  const icon = httpsOrEmpty(input.shop?.logo_url);
  if (icon) out.icon = icon;
  const wa = String(input.shop?.whatsapp ?? "").replace(/\D/g, "");
  if (wa.length >= 10 && wa.length <= 15) out.wa = wa;
  const shopName = String(input.shop?.name ?? "").trim().slice(0, 80);
  if (shopName) out.shop = shopName;
  if (input.kind === "offer") {
    const image = httpsOrEmpty(input.imageUrl);
    if (image) out.image = image;
    const code = String(input.offerCode ?? "").trim().slice(0, 40);
    if (code) out.code = code;
  }
  return out;
}
