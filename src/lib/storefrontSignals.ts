/**
 * Live shop signals for the public store (Street theme): which listed products are the week's
 * best sellers, selling fast right now, just arrived on a purchase bill, and bought together
 * ("Complete the look"). Worked out from the shop's own bills by get_public_storefront_signals
 * (20270504120000), which returns product ids only — no quantities or amounts.
 *
 * On unless the shop switches it off in Website → Theme
 * (organizations.settings.storefront_signals = { enabled: false }); the database function reads
 * that switch itself, so nothing reaches the store when it is off.
 */
export const STOREFRONT_SIGNALS_KEY = "storefront_signals";
/** Cards outside the best-seller row show the rank only for the top three. */
export const BEST_SELLER_FLAG_TOP = 3;

export type StorefrontSignals = {
  /** Product ids, best first. */
  bestSellers: string[];
  sellingFast: string[];
  /** Newest first; `at` is when the purchase bill was entered. */
  justArrived: Array<{ productId: string; at: string | null }>;
  /** Product id → products most often on the same bill, most often first. */
  boughtTogether: Record<string, string[]>;
};

export const EMPTY_STOREFRONT_SIGNALS: StorefrontSignals = {
  bestSellers: [],
  sellingFast: [],
  justArrived: [],
  boughtTogether: {},
};

function id(value: unknown): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= 80 && /^[A-Za-z0-9-]+$/.test(text) ? text : null;
}

function idList(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const v = id(item);
    if (v && !out.includes(v)) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

/** get_public_storefront_signals → signals. Anything malformed is dropped. */
export function parseStorefrontSignals(raw: unknown): StorefrontSignals {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return EMPTY_STOREFRONT_SIGNALS;
  const row = raw as Record<string, unknown>;
  const justArrived: StorefrontSignals["justArrived"] = [];
  for (const item of Array.isArray(row.just_arrived) ? row.just_arrived : []) {
    if (!item || typeof item !== "object") continue;
    const productId = id((item as Record<string, unknown>).product_id);
    if (!productId || justArrived.some((a) => a.productId === productId)) continue;
    const at = (item as Record<string, unknown>).at;
    justArrived.push({ productId, at: typeof at === "string" && !Number.isNaN(Date.parse(at)) ? at : null });
    if (justArrived.length >= 24) break;
  }
  const boughtTogether: Record<string, string[]> = {};
  for (const item of Array.isArray(row.bought_together) ? row.bought_together : []) {
    if (!item || typeof item !== "object") continue;
    const productId = id((item as Record<string, unknown>).product_id);
    const others = idList((item as Record<string, unknown>).with, 4).filter((other) => other !== productId);
    if (productId && others.length > 0) boughtTogether[productId] = others;
  }
  return {
    bestSellers: idList(row.best_sellers, 10),
    sellingFast: idList(row.selling_fast, 40),
    justArrived,
    boughtTogether,
  };
}

/** The shop's switch as saved (Website → Theme). On unless explicitly off. */
export function parseStorefrontSignalsEnabled(orgSettings: unknown): boolean {
  if (!orgSettings || typeof orgSettings !== "object" || Array.isArray(orgSettings)) return true;
  const raw = (orgSettings as Record<string, unknown>)[STOREFRONT_SIGNALS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return true;
  return (raw as Record<string, unknown>).enabled !== false;
}

/** "Arrived today", "Arrived yesterday", "Arrived 3 days ago"; null when the date is unknown. */
export function arrivedLabel(at: string | null, now: Date = new Date()): string | null {
  if (!at) return null;
  const then = new Date(at);
  if (Number.isNaN(then.getTime())) return null;
  const day = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const days = Math.round((day(now) - day(then)) / 86_400_000);
  if (days <= 0) return "Arrived today";
  if (days === 1) return "Arrived yesterday";
  return `Arrived ${days} days ago`;
}

/** Quick lookups the product cards use. */
export type StorefrontSignalIndex = {
  /** Product id → 1-based best-seller rank. */
  rank: Map<string, number>;
  fast: Set<string>;
  arrived: Map<string, string | null>;
};

export function indexStorefrontSignals(signals: StorefrontSignals): StorefrontSignalIndex {
  return {
    rank: new Map(signals.bestSellers.map((productId, i) => [productId, i + 1])),
    fast: new Set(signals.sellingFast),
    arrived: new Map(signals.justArrived.map((a) => [a.productId, a.at])),
  };
}

export type StorefrontSignalFlag =
  | { kind: "best"; text: string }
  | { kind: "fast"; text: string }
  | { kind: "arrived"; text: string }
  | null;

/**
 * The one live flag a card shows (stock flags such as "Sold out" and "Few left" come first and
 * are decided by the caller). `everyRank` is for the best-seller row, where all ten show a rank.
 */
export function storefrontSignalFlag(
  productId: string,
  index: StorefrontSignalIndex,
  everyRank = false,
): StorefrontSignalFlag {
  const rank = index.rank.get(productId);
  if (rank && (everyRank || rank <= BEST_SELLER_FLAG_TOP)) return { kind: "best", text: `#${rank} this week` };
  if (index.fast.has(productId)) return { kind: "fast", text: "Selling fast" };
  if (index.arrived.has(productId)) return { kind: "arrived", text: "Just in" };
  return null;
}
