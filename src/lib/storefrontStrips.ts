/**
 * Street theme notice strips and the currency picker (Website → Theme → Notices & currency).
 *
 *   top           black strip above the header: one notice at a time with ‹ › arrows
 *                 (terms such as "No exchange / no return")
 *   after_banner  black running strip under the home banner
 *   footer        running strip above the footer (payment and delivery terms)
 *
 * Saved on organizations.settings.storefront_strips and .storefront_currency, and read by the
 * public store through get_org_public_info (20270506120000). Before that file is run, the store
 * uses the defaults below.
 */
export const STOREFRONT_STRIPS_KEY = "storefront_strips";
export const STOREFRONT_CURRENCY_KEY = "storefront_currency";
export const STRIP_LINES_MAX = 8;
export const STRIP_LINE_MAX_CHARS = 160;
export const CURRENCY_STORAGE_KEY = "st-currency-v1";

export type StripId = "top" | "after_banner" | "footer";
export type StorefrontStrips = Record<StripId, string[]>;

export const STRIP_IDS: StripId[] = ["top", "after_banner", "footer"];

function cleanLines(value: unknown): string[] {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(/\r?\n/) : [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const line = item.replace(/\s+/g, " ").trim().slice(0, STRIP_LINE_MAX_CHARS);
    if (line && !out.includes(line)) out.push(line);
    if (out.length >= STRIP_LINES_MAX) break;
  }
  return out;
}

/** Saved strips; a strip the shop never set is absent (null), an emptied one is []. */
export function parseStorefrontStrips(orgSettings: unknown): Record<StripId, string[] | null> {
  const out: Record<StripId, string[] | null> = { top: null, after_banner: null, footer: null };
  if (!orgSettings || typeof orgSettings !== "object" || Array.isArray(orgSettings)) return out;
  const raw = (orgSettings as Record<string, unknown>)[STOREFRONT_STRIPS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  for (const id of STRIP_IDS) {
    if (id in (raw as Record<string, unknown>)) out[id] = cleanLines((raw as Record<string, unknown>)[id]);
  }
  return out;
}

/** Text typed in the settings box (one notice per line) → what gets saved. */
export function stripLinesFromText(text: string): string[] {
  return cleanLines(text);
}

/**
 * What the store shows. A strip the shop never set falls back to lines built from what the store
 * already knows; one the shop emptied stays hidden.
 */
export function resolveStorefrontStrips(
  saved: Record<StripId, string[] | null>,
  facts: { upi: boolean; whatsapp: boolean; location: string | null },
): StorefrontStrips {
  const general = [
    "New styles added regularly",
    "Sizes and stock shown live from the store",
    facts.upi ? "Order online · pay by UPI" : null,
    facts.whatsapp ? "Questions? Chat with us on WhatsApp" : null,
    facts.location ? `Visit us · ${facts.location}` : null,
  ].filter((l): l is string => Boolean(l));
  const footer = [
    facts.upi ? "Safe payment by UPI" : null,
    "Sizes and stock shown live from the store",
    facts.whatsapp ? "Delivery questions? Chat with us on WhatsApp" : null,
  ].filter((l): l is string => Boolean(l));
  return {
    top: saved.top ?? general,
    after_banner: saved.after_banner ?? general,
    footer: saved.footer ?? footer,
  };
}

/* ---------- currency ---------- */

export type CurrencyCode = "INR" | "USD" | "EUR" | "GBP" | "CAD" | "AUD" | "AED";

export const CURRENCIES: Array<{ code: CurrencyCode; name: string; flag: string; locale: string }> = [
  { code: "INR", name: "Indian Rupee", flag: "🇮🇳", locale: "en-IN" },
  { code: "USD", name: "US Dollar", flag: "🇺🇸", locale: "en-US" },
  { code: "EUR", name: "Euro", flag: "🇪🇺", locale: "en-IE" },
  { code: "GBP", name: "British Pound", flag: "🇬🇧", locale: "en-GB" },
  { code: "CAD", name: "Canadian Dollar", flag: "🇨🇦", locale: "en-CA" },
  { code: "AUD", name: "Australian Dollar", flag: "🇦🇺", locale: "en-AU" },
  { code: "AED", name: "UAE Dirham", flag: "🇦🇪", locale: "en-AE" },
];

/**
 * Rupees for one unit of each currency. A starting point only: the shop should keep these up to
 * date in Website → Theme. Prices in other currencies are shown as approximate, and the bag and
 * checkout always charge in rupees.
 */
export const DEFAULT_INR_RATES: Record<Exclude<CurrencyCode, "INR">, number> = {
  USD: 84,
  EUR: 90,
  GBP: 106,
  CAD: 60,
  AUD: 55,
  AED: 23,
};

export type StorefrontCurrency = {
  /** Shows the picker at the bottom left. On unless the shop switches it off. */
  enabled: boolean;
  rates: Record<Exclude<CurrencyCode, "INR">, number>;
};

export function parseStorefrontCurrency(orgSettings: unknown): StorefrontCurrency {
  const out: StorefrontCurrency = { enabled: true, rates: { ...DEFAULT_INR_RATES } };
  if (!orgSettings || typeof orgSettings !== "object" || Array.isArray(orgSettings)) return out;
  const raw = (orgSettings as Record<string, unknown>)[STOREFRONT_CURRENCY_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return out;
  const row = raw as Record<string, unknown>;
  if (row.enabled === false) out.enabled = false;
  const rates = row.rates;
  if (rates && typeof rates === "object" && !Array.isArray(rates)) {
    for (const code of Object.keys(DEFAULT_INR_RATES) as Array<keyof typeof DEFAULT_INR_RATES>) {
      const n = Number((rates as Record<string, unknown>)[code]);
      if (Number.isFinite(n) && n > 0 && n < 10_000) out.rates[code] = Math.round(n * 100) / 100;
    }
  }
  return out;
}

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return CURRENCIES.some((c) => c.code === value);
}

/**
 * Price label in the shopper's currency: rupees as usual, anything else as "≈ $15.50"
 * (two decimals, from the shop's rate). Empty when there is no price.
 */
export function formatShopperPrice(
  rupees: number | null | undefined,
  code: CurrencyCode,
  currency: StorefrontCurrency,
): string {
  if (rupees == null || !Number.isFinite(Number(rupees))) return "";
  const info = CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0];
  if (code === "INR") {
    return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(rupees));
  }
  const rate = currency.rates[code];
  const value = Number(rupees) / rate;
  return `≈ ${new Intl.NumberFormat(info.locale, { style: "currency", currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}`;
}
