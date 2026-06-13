/**
 * React Query staleTime tiers — reduces Supabase reads on tab focus / navigation.
 * Global default in App.tsx is STALE_DEFAULT (30s). Override per-query when needed.
 *
 * CRITICAL EXCEPTIONS (never use long staleTime on these):
 * - queryKey includes live search/filter/barcode variables → STALE_LIVE (0)
 * - POS barcode lookups → STALE_LIVE (0)
 * - Paginated lists (page in queryKey, no live search) → STALE_PAGINATED (5s)
 *
 * Do NOT set refetchOnMount: false on queries — React Query defaults to true so the
 * first visit to a page always fetches fresh data; only tab switches within staleTime skip refetch.
 */

/** Default for most queries (App.tsx defaultOptions). */
export const STALE_DEFAULT = 30_000;

/** Settings, org config, print/e-invoice labels — rarely changes per session. */
export const STALE_SETTINGS = 5 * 60 * 1000;

/** Products, suppliers, categories, academic years — reference data. */
export const STALE_REFERENCE = 2 * 60 * 1000;

/** Ledgers, balances, invoice lists — fresher but still cached briefly. */
export const STALE_FREQUENT = 10_000;

/** Paginated grids (page in queryKey, no search term in key). */
export const STALE_PAGINATED = 5_000;

/** Sales/POS dashboards — reuse cache when switching window tabs; invalidation still forces fresh. */
export const STALE_DASHBOARD_TAB_RETURN = 120_000;

/** Search-as-you-type, filters, barcode scan — must refetch when key changes. */
export const STALE_LIVE = 0;

/** @deprecated Use STALE_LIVE */
export const STALE_SEARCH = STALE_LIVE;

/** Substrings in serialized queryKey that require STALE_LIVE (0). */
const LIVE_QUERY_KEY_MARKERS = [
  "debouncedsearch",
  "searchterm",
  "searchquery",
  "product-by-barcode",
  "variant-lookup",
  "barcode-scan",
  "barcode-stock-scan",
] as const;

/** Query key prefixes that include live filters (not static catalog keys like org-settings). */
const LIVE_QUERY_KEY_PREFIXES = [
  "customers-search",
  "filtered-invoices",
  "student-search-fee",
  "floating-stock-fallback",
] as const;

/** Substrings that indicate pagination (use STALE_PAGINATED unless live markers win). */
const PAGINATED_QUERY_KEY_MARKERS = [
  "currentpage",
  "pagesize",
  "itemsperpage",
  "page_size",
] as const;

function serializeQueryKey(queryKey: readonly unknown[]): string {
  return queryKey.map((part) => String(part ?? "")).join("\0").toLowerCase();
}

/**
 * Pick staleTime from queryKey shape. Search/filter/barcode wins over pagination.
 */
export function staleTimeForQueryKey(queryKey: readonly unknown[]): number {
  const serialized = serializeQueryKey(queryKey);
  const head = String(queryKey[0] ?? "").toLowerCase();

  if (LIVE_QUERY_KEY_MARKERS.some((m) => serialized.includes(m))) {
    return STALE_LIVE;
  }
  if (LIVE_QUERY_KEY_PREFIXES.some((p) => head === p || head.startsWith(p))) {
    return STALE_LIVE;
  }
  // Dynamic filter segments in key (e.g. deliveryFilter, statusFilter values)
  if (/\bfilter\b/.test(head) || head.includes("-filter")) {
    return STALE_LIVE;
  }

  if (PAGINATED_QUERY_KEY_MARKERS.some((m) => serialized.includes(m))) {
    return STALE_PAGINATED;
  }
  if (/\bpage\b/.test(serialized) && /\b(currentpage|page_size|itemsperpage)\b/.test(serialized)) {
    return STALE_PAGINATED;
  }

  return STALE_DEFAULT;
}
