import { resolveTabCachePath } from "@/lib/tabPageRegistry";

/** Time before showing the "Retry tab / Refresh app" card. */
export const TAB_LOAD_TIMEOUT_MS = 6_000;
/** Soft remount + bandwidth pause — fire early so hung cold chunks recover. */
export const SOFT_LOADING_HINT_MS = 3_000;
/** Drop a background prefetch that never settled before remounting the active tab. */
export const STALE_IN_FLIGHT_MS = 4_000;
/**
 * Large admin chunks (Settings, purchase, POS) — slightly longer than the
 * default, not the old 45s skeleton. Soft retry still fires at 3s and does
 * not reset this clock. 4s stale drop + a full 6s default budget = 10s, so a
 * genuinely failed chunk still offers Retry soon after a normal tab.
 */
export const HEAVY_TAB_LOAD_TIMEOUT_MS = STALE_IN_FLIGHT_MS + TAB_LOAD_TIMEOUT_MS;

export const HEAVY_TAB_PATHS = new Set([
  "settings",
  "user-rights",
  "barcode-printing",
  "accounts",
  "third-party-entry",
  "third-party-balances",
  "pos-dashboard",
  "sales-invoice-dashboard",
  // Canonical URL slug + legacy registry key (resolveTabCachePath → purchase-bills)
  "purchase-bills",
  "purchase-bill-dashboard",
  "pos-sales",
  "pos-delivery-challan",
  "sales-invoice",
  "purchase-entry",
  "product-entry",
  "sale-return-entry",
  "purchase-return-entry",
  "purchase-return-dashboard",
  "purchase-returns",
  "sale-return-dashboard",
  "product-dashboard",
  "products",
]);

export function getTabLoadTimeoutMs(path: string): number {
  const resolved = resolveTabCachePath(path);
  return HEAVY_TAB_PATHS.has(resolved) || HEAVY_TAB_PATHS.has(path)
    ? HEAVY_TAB_LOAD_TIMEOUT_MS
    : TAB_LOAD_TIMEOUT_MS;
}

/** Independent of the hard budget. Heavy paths still soft-retry at 3s. */
export function shouldSoftRetryChunk(elapsedMs: number): boolean {
  return elapsedMs >= SOFT_LOADING_HINT_MS;
}

export function shouldShowTabLoadTimeout(elapsedMs: number, path: string): boolean {
  return elapsedMs >= getTabLoadTimeoutMs(path);
}
