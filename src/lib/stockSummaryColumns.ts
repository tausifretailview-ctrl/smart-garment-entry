/** Show / hide columns on Stock Summary, remembered per organisation on this device. */

export type StockSummaryColumnView = "variants" | "articles";

/** Columns a user may hide. Sr No, Product, Size-wise stock and Current Stock always show. */
export const VARIANT_HIDEABLE = [
  "supplier",
  "invoice",
  "brand",
  "category",
  "size",
  "color",
  "style",
  "barcode",
  "opening",
  "purchase",
  "purReturn",
  "sales",
  "saleReturn",
  "transferOut",
  "purPrice",
  "stockValue",
  "salePrice",
] as const;

export const ARTICLE_HIDEABLE = [
  "supplier",
  "brand",
  "category",
  "style",
  "color",
  "sizes",
  "stockValue",
  "saleValue",
  "status",
] as const;

export type HiddenColumns = Record<StockSummaryColumnView, string[]>;

const EMPTY: HiddenColumns = { variants: [], articles: [] };

const storageKey = (orgId: string) => `ezzy.stockSummary.hiddenColumns.v1.${orgId}`;

/** Keep only known keys so a stale or hand-edited value cannot hide the wrong thing. */
export function sanitizeHiddenColumns(raw: unknown): HiddenColumns {
  if (!raw || typeof raw !== "object") return { variants: [], articles: [] };
  const obj = raw as Partial<Record<StockSummaryColumnView, unknown>>;
  const pick = (value: unknown, allowed: readonly string[]) =>
    Array.isArray(value) ? [...new Set(value.filter((k): k is string => typeof k === "string" && allowed.includes(k)))] : [];
  return {
    variants: pick(obj.variants, VARIANT_HIDEABLE),
    articles: pick(obj.articles, ARTICLE_HIDEABLE),
  };
}

export function loadHiddenColumns(orgId: string | undefined): HiddenColumns {
  if (!orgId) return { ...EMPTY };
  try {
    const text = window.localStorage.getItem(storageKey(orgId));
    return text ? sanitizeHiddenColumns(JSON.parse(text)) : { variants: [], articles: [] };
  } catch {
    return { variants: [], articles: [] };
  }
}

export function saveHiddenColumns(orgId: string | undefined, hidden: HiddenColumns): void {
  if (!orgId) return;
  try {
    window.localStorage.setItem(storageKey(orgId), JSON.stringify(hidden));
  } catch {
    // Private mode or storage full: the choice simply lasts for this visit.
  }
}

export function toggleHiddenColumn(hidden: HiddenColumns, view: StockSummaryColumnView, key: string): HiddenColumns {
  const list = hidden[view];
  return { ...hidden, [view]: list.includes(key) ? list.filter((k) => k !== key) : [...list, key] };
}
