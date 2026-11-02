// Amazon Selling Partner API (SP-API) helpers for the amazon-sync edge function.
// Pure functions only (no Deno or network), so vitest can test them.
// Amazon.in is served from the Europe endpoint; marketplace id A21TJRUUN4KGV.

export const AMAZON_IN_MARKETPLACE_ID = "A21TJRUUN4KGV";
export const SP_API_EU_ENDPOINT = "https://sellingpartnerapi-eu.amazon.com";
export const LWA_TOKEN_URL = "https://api.amazon.com/auth/o2/token";

/** Most pieces Ezzy ever sends for one SKU (guards a bad stock figure). */
export const MAX_PUSH_QTY = 100000;

/**
 * Quantity to show on Amazon: Ezzy stock of the size minus the safety buffer,
 * whole pieces only, never below 0.
 */
export function amazonPushQty(stock: number | null | undefined, buffer: number | null | undefined): number {
  const s = Number(stock);
  const b = Math.max(0, Math.floor(Number(buffer) || 0));
  if (!Number.isFinite(s)) return 0;
  const qty = Math.floor(s) - b;
  if (qty <= 0) return 0;
  return Math.min(qty, MAX_PUSH_QTY);
}

/** Buffer for one SKU: its own value when set, else the shop default. */
export function effectiveBuffer(own: number | null | undefined, shopDefault: number | null | undefined): number {
  if (own !== null && own !== undefined && Number.isFinite(Number(own))) return Math.max(0, Math.floor(Number(own)));
  return Math.max(0, Math.floor(Number(shopDefault) || 0));
}

/** Seller SKU as Amazon stores it: trimmed, inner spaces kept, at most 40 characters. */
export function cleanSellerSku(raw: unknown): string {
  return String(raw ?? "").replace(/[\r\n\t]+/g, " ").trim().slice(0, 40);
}

/** Amazon Seller ID / Merchant token: letters and digits, 8 to 20 long. */
export function isValidSellerId(raw: unknown): boolean {
  return /^[A-Z0-9]{8,20}$/.test(String(raw ?? "").trim().toUpperCase());
}

/** Body of a Listings Items PATCH that sets the quantity the seller ships themselves. */
export function buildQuantityPatch(qty: number): Record<string, unknown> {
  return {
    productType: "PRODUCT",
    patches: [
      {
        op: "replace",
        path: "/attributes/fulfillment_availability",
        value: [{ fulfillment_channel_code: "DEFAULT", quantity: Math.max(0, Math.floor(qty)) }],
      },
    ],
  };
}

/** Listings Items PATCH URL for one SKU. */
export function listingsItemUrl(sellerId: string, sku: string, marketplaceId = AMAZON_IN_MARKETPLACE_ID): string {
  return `${SP_API_EU_ENDPOINT}/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}` +
    `?marketplaceIds=${encodeURIComponent(marketplaceId)}`;
}

export type PushOutcome =
  | { kind: "ok" }
  | { kind: "retry"; message: string }
  | { kind: "failed"; message: string };

/** Plain-language result of one Listings PATCH reply. 429 / 5xx are retried next run. */
export function readPushReply(status: number, body: unknown): PushOutcome {
  // deno-lint-ignore no-explicit-any
  const b = (body ?? {}) as any;
  if (status === 429) return { kind: "retry", message: "Amazon asked us to slow down; will retry." };
  if (status >= 500) return { kind: "retry", message: `Amazon is busy (HTTP ${status}); will retry.` };
  if (status === 401 || status === 403) {
    return { kind: "failed", message: "Amazon refused the login. Check the keys and the app's Inventory role." };
  }
  if (status === 404) return { kind: "failed", message: "This SKU was not found in your Amazon.in listings." };
  const issues = Array.isArray(b?.issues) ? b.issues : [];
  const errors = issues.filter((i: { severity?: string }) => String(i?.severity ?? "").toUpperCase() === "ERROR");
  if (status >= 200 && status < 300 && String(b?.status ?? "").toUpperCase() === "ACCEPTED" && errors.length === 0) {
    return { kind: "ok" };
  }
  const first = errors[0] ?? issues[0] ?? (Array.isArray(b?.errors) ? b.errors[0] : null);
  const text = String(first?.message ?? "").trim();
  return { kind: "failed", message: text ? `Amazon: ${text.slice(0, 300)}` : `Amazon did not accept it (HTTP ${status}).` };
}

/** One line per mapping in a pasted list: "SKU, barcode" (comma, tab or several spaces). */
export function parseSkuBarcodeLines(text: string): { sku: string; barcode: string }[] {
  const out: { sku: string; barcode: string }[] = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const parts = line.split(/\t|,| {2,}/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 2) continue;
    const sku = cleanSellerSku(parts[0]);
    const barcode = parts[1].trim();
    if (!sku || !barcode || /^sku$/i.test(sku)) continue;
    out.push({ sku, barcode });
  }
  return out;
}
