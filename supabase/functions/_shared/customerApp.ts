// Customer app (customer-app edge function) — pure helpers, no Deno APIs, so Vitest covers them.

/** Last 10 digits of a phone number ("" when fewer than 10 digits). */
export function phoneLast10(phone: string | null | undefined): string {
  const digits = String(phone ?? "").replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : "";
}

/** "******8772" — never echo a full number back to an unauthenticated caller. */
export function maskPhone(phone: string | null | undefined): string {
  const p = phoneLast10(phone);
  return p ? `******${p.slice(-4)}` : "";
}

/** Shop subdomain label, lower-case; "" when invalid. */
export function cleanSubdomain(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase();
  return /^[a-z0-9-]{1,63}$/.test(s) ? s : "";
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** Taxable value + GST of one bill line (line amount is GST-inclusive unless taxType is exclusive). */
export function lineTax(
  amount: number,
  gstPercent: number,
  taxType: string | null | undefined,
): { taxable: number; tax: number } {
  const amt = Number(amount) || 0;
  const gst = Math.max(0, Number(gstPercent) || 0);
  if (String(taxType ?? "").toLowerCase() === "exclusive") {
    return { taxable: round2(amt), tax: round2((amt * gst) / 100) };
  }
  const taxable = round2((amt * 100) / (100 + gst));
  return { taxable, tax: round2(amt - taxable) };
}

export type CustomerTxn = {
  date: string;
  kind: "bill" | "payment" | "return";
  ref: string;
  amount: number;
  /** Bills only: amount still unpaid on this bill. */
  due?: number;
  saleId?: string;
  note?: string;
};

type SaleLite = {
  id: string;
  sale_number: string;
  sale_date: string;
  net_amount: number | null;
  paid_amount: number | null;
};
type ReceiptLite = {
  voucher_number: string;
  voucher_date: string;
  total_amount: number | null;
  payment_method: string | null;
};
type ReturnLite = {
  return_number: string | null;
  return_date: string;
  net_amount: number | null;
  original_sale_number: string | null;
};

/**
 * Activity list for the customer (newest first): bills, payments received after the bill,
 * and sale returns. The closing balance shown to the customer comes from the canonical
 * financial snapshot, not from summing this list.
 */
export function buildCustomerTransactions(
  sales: SaleLite[],
  receipts: ReceiptLite[],
  returns: ReturnLite[],
): CustomerTxn[] {
  const rows: CustomerTxn[] = [];
  for (const s of sales) {
    const amount = round2(Number(s.net_amount) || 0);
    rows.push({
      date: s.sale_date,
      kind: "bill",
      ref: s.sale_number,
      amount,
      due: Math.max(0, round2(amount - (Number(s.paid_amount) || 0))),
      saleId: s.id,
    });
  }
  for (const r of receipts) {
    rows.push({
      date: r.voucher_date,
      kind: "payment",
      ref: r.voucher_number,
      amount: round2(Number(r.total_amount) || 0),
      note: r.payment_method ?? undefined,
    });
  }
  for (const r of returns) {
    rows.push({
      date: r.return_date,
      kind: "return",
      ref: r.return_number || "Return",
      amount: round2(Number(r.net_amount) || 0),
      note: r.original_sale_number ? `Against ${r.original_sale_number}` : undefined,
    });
  }
  return rows.sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** Client IP for login rate limits: platform headers first, then the first X-Forwarded-For hop. */
export type CustomerAppShop = {
  name: string;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  logo_url: string | null;
};

/**
 * Public shop header for the customer app (no session): name, address, phone and logo from
 * the shop's settings. Logo only when it is an https URL; WhatsApp is the 91-prefixed mobile.
 */
export function shopProfileFromSettings(
  orgName: string,
  settings: {
    business_name?: string | null;
    address?: string | null;
    mobile_number?: string | null;
    bill_barcode_settings?: unknown;
  } | null,
): CustomerAppShop {
  const logoRaw = (settings?.bill_barcode_settings as { logo_url?: unknown } | null | undefined)?.logo_url;
  const logo = typeof logoRaw === "string" && /^https:\/\//i.test(logoRaw.trim()) ? logoRaw.trim().slice(0, 500) : null;
  const phone = (settings?.mobile_number ?? "").trim() || null;
  const last10 = phoneLast10(phone);
  return {
    name: (settings?.business_name ?? "").trim() || orgName,
    address: (settings?.address ?? "").replace(/\s+/g, " ").trim().slice(0, 200) || null,
    phone,
    whatsapp: last10 ? `91${last10}` : null,
    logo_url: logo,
  };
}

export function clientIp(headers: { get(name: string): string | null }): string {
  const ip =
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    (headers.get("x-forwarded-for") ?? "").split(",")[0];
  return String(ip ?? "").trim().slice(0, 64) || "unknown";
}

// ── Customer app session token ─────────────────────────────────────────────
// Stateless and HMAC-signed: "ca1.<payload>.<sig>". Deliberately NOT a portal_sessions row, so
// the B2B portal functions (portal-catalogue / portal-order) never accept it.

export type CustomerAppSession = { organizationId: string; customerId: string; expiresAt: number };

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

/** Session signing secret derived from a server secret (so no extra env var is required). */
export async function deriveSessionSecret(serverSecret: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(serverSecret), enc.encode("customer-app-session-v1"));
  return b64url(new Uint8Array(sig));
}

export async function signSessionToken(session: CustomerAppSession, secret: string): Promise<string> {
  const payload = b64url(
    enc.encode(JSON.stringify({ o: session.organizationId, c: session.customerId, e: session.expiresAt })),
  );
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(`ca1.${payload}`));
  return `ca1.${payload}.${b64url(new Uint8Array(sig))}`;
}

/** Valid, unexpired token for this org → session; anything else → null. */
export async function verifySessionToken(
  token: unknown,
  secret: string,
  organizationId: string,
  now = Date.now(),
): Promise<CustomerAppSession | null> {
  const t = String(token ?? "");
  if (t.length > 1000) return null;
  const parts = t.split(".");
  if (parts.length !== 3 || parts[0] !== "ca1") return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret),
      fromB64url(parts[2]) as unknown as BufferSource,
      enc.encode(`ca1.${parts[1]}`),
    );
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(fromB64url(parts[1]))) as { o?: string; c?: string; e?: number };
    if (!p.o || !p.c || typeof p.e !== "number" || p.o !== organizationId || p.e <= now) return null;
    return { organizationId: p.o, customerId: p.c, expiresAt: p.e };
  } catch {
    return null;
  }
}

// ── Shop website ("Shop now") ──────────────────────────────────────────────

/** Where the shop's own website (EzzyERP storefront) lives; ERP's public storefront host. */
export const STOREFRONT_APP_ORIGIN = "https://app.inventoryshop.in";

/**
 * Public storefront link for the "Shop now" button, or null when the shop has no published
 * website. A connected custom domain wins; otherwise the store page on the app host.
 */
export function storefrontUrlFor(
  website: { slug?: string | null; custom_domain?: string | null; is_published?: boolean | null } | null,
  appOrigin: string = STOREFRONT_APP_ORIGIN,
): string | null {
  if (!website?.is_published) return null;
  const domain = String(website.custom_domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "");
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) return `https://${domain}/`;
  const slug = String(website.slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,63}$/.test(slug)) return null;
  return `${appOrigin.replace(/\/+$/, "")}/${slug}/store`;
}

// ── Reward points ──────────────────────────────────────────────────────────

export type CustomerPointsRules = {
  enabled: boolean;
  /** "Every ₹{earnPerAmount} spent earns {earnPoints} points". */
  earnPerAmount: number;
  earnPoints: number;
  minPurchaseForPoints: number;
  redemptionEnabled: boolean;
  /** ₹ value of one point at billing. */
  pointValue: number;
  minPointsToRedeem: number;
  maxRedeemPercent: number;
  expiryDays: number;
};

const num = (v: unknown, fallback: number, min = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) && n >= min ? n : fallback;
};

/** The shop's points rules from settings.sale_settings, with the ERP's own defaults. */
export function pointsRulesFromSaleSettings(saleSettings: unknown): CustomerPointsRules {
  const s = (saleSettings && typeof saleSettings === "object" ? saleSettings : {}) as Record<string, unknown>;
  return {
    enabled: s.enable_points_system === true,
    earnPerAmount: num(s.points_ratio_amount, 100, 0.01),
    earnPoints: num(s.points_per_ratio, 1),
    minPurchaseForPoints: num(s.min_purchase_for_points, 0),
    redemptionEnabled: s.enable_points_redemption === true,
    pointValue: num(s.points_redemption_value, 1),
    minPointsToRedeem: num(s.min_points_for_redemption, 1),
    maxRedeemPercent: num(s.max_redemption_percent, 50),
    expiryDays: num(s.points_expiry_days, 0),
  };
}
