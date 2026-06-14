import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const SKEW_RELOAD_KEY = "skew_reload_count";
const MAX_SKEW_RECOVERY_RELOADS = 1;
const MAX_IMPORT_RETRIES = 5;
const RETRY_BASE_MS = 500;
/** Per-attempt ceiling so a hung dynamic import cannot block Suspense forever.
 *  Raised from 25s → 60s because slow networks / Windows WebView cold starts
 *  legitimately need more time, and a false timeout dumps the user on the
 *  "This tab failed to load" screen. */
export const MODULE_LOAD_TIMEOUT_MS = 60_000;

/** Paths prefetched right after org login so first bill open does not cold-load a large chunk. */
export const POST_LOGIN_PREFETCH_TAB_PATHS = [
  "", // main dashboard — fast return from POS / window tabs
  "pos-sales",
  "pos-dashboard",
  "sales-invoice",
  "sales-invoice-dashboard",
  "purchase-entry",
  "purchase-bill-dashboard",
  // Frequently switched-to from Sales/Purchase — warm so first open is instant
  "stock-report",
  "customers",
  "suppliers",
  "product-dashboard",
  "product-entry",
  "purchase-return-entry",
  "sale-return-dashboard",
  "purchase-return-dashboard",
  "accounts",
  // URL-slug aliases used in App.tsx routes (resolved to the same chunks)
  "products",
  "purchase-bills",
  "purchase-returns",
] as const;

/**
 * Slim post-login prefetch list for web/PWA — only the modules a cashier
 * typically opens first. Avoids a 20+ chunk waterfall on cold load that
 * starves the visible tab and triggers the "Taking longer than expected"
 * screen on slow shop Wi-Fi.
 */
export const POST_LOGIN_PREFETCH_TAB_PATHS_WEB = [
  "",
  "pos-sales",
  "pos-dashboard",
  "sales-invoice-dashboard",
  "purchase-bills",
  "purchase-bill-dashboard",
  "stock-report",
] as const;

/**
 * Inventory dashboards — warmed on browser idle after login (web/PWA only).
 * Small list so first Purchase/Products open is faster without a chunk waterfall.
 */
export const POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS = [
  "product-dashboard",
  "products",
  "purchase-bill-dashboard",
  "purchase-bills",
  "purchase-return-dashboard",
  "purchase-returns",
] as const;

/** Heavy admin modules — warmed on browser idle after login (not blocking bill entry). */
export const POST_LOGIN_IDLE_PREFETCH_TAB_PATHS = [
  "settings",
  "user-rights",
  "audit-log",
  "barcode-printing",
  // Reports & secondary dashboards — warm on idle so first open is instant.
  "sales-report-by-customer",
  "sales-report",
  "purchase-report-by-supplier",
  "purchase-report",
  "item-wise-sales",
  "item-wise-stock",
  "stock-adjustment",
  "stock-ageing",
  "stock-settlement",
  "stock-analysis",
  "daily-cashier-report",
  "daily-tally",
  "daily-sale-analysis",
  "hourly-sales-analysis",
  "sales-analytics",
  "net-profit-analysis",
  "einvoice-report",
  "customer-ledger-report",
  "customer-account-statement",
  "customer-balance-activity",
  "customer-audit-report",
  "customer-reconciliation",
  "accounting-reports",
  "expense-salary-report",
  "gst-reports",
  "gst-register",
  "tally-export",
  "price-history",
  "product-tracking",
  "payments-dashboard",
  "delivery-dashboard",
  "delivery-challan-dashboard",
  "advance-booking-dashboard",
  "purchase-orders",
  "salesman-commission",
  "bulk-product-update",
  "employees",
  "profile",
] as const;

export function isChunkLoadError(error: unknown): boolean {
  const err = error instanceof Error ? error : null;
  const name = err?.name ?? "";
  const msg =
    err?.message ??
    (typeof error === "string" ? error : "");

  if (name === "ChunkLoadError") return true;

  if (!msg) return false;

  return (
    /failed to fetch dynamically imported module/i.test(msg) ||
    /loading chunk .* failed/i.test(msg) ||
    /importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /loading css chunk .* failed/i.test(msg) ||
    /\bis not defined\b/.test(msg) ||
    /unexpected token '<'/i.test(msg) ||
    msg.includes("Module load timed out")
  );
}

/** Clears the one-reload skew budget after a healthy boot. */
export function resetSkewReloadCount(): void {
  try {
    sessionStorage.removeItem(SKEW_RELOAD_KEY);
  } catch {
    // ignore private mode / storage errors
  }
}

/**
 * Bounded full-page reload for deploy/version skew. MAX 1 per session until reset.
 * Returns true if reload was initiated (caller should show a brief splash).
 */
export function attemptSkewRecoveryReload(): boolean {
  try {
    const count = parseInt(sessionStorage.getItem(SKEW_RELOAD_KEY) || "0", 10);
    if (count >= MAX_SKEW_RECOVERY_RELOADS) return false;
    sessionStorage.setItem(SKEW_RELOAD_KEY, String(count + 1));
    window.location.reload();
    return true;
  } catch {
    return false;
  }
}

function importWithTimeout<T>(
  importFn: () => Promise<T>,
  timeoutMs = MODULE_LOAD_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("Module load timed out"));
    }, timeoutMs);

    importFn()
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        window.clearTimeout(timer);
        reject(error);
      });
  });
}

/**
 * Retries transient chunk/network failures before a single guarded full reload.
 * Used by React.lazy and tab prefetch loaders (Windows WebView / PWA cold start).
 */
export async function importWithRetry<T>(importFn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_IMPORT_RETRIES; attempt++) {
    try {
      return await importWithTimeout(importFn);
    } catch (error) {
      lastError = error;
      if (!isChunkLoadError(error) || attempt >= MAX_IMPORT_RETRIES - 1) {
        break;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_BASE_MS * (attempt + 1)),
      );
    }
  }

  // Auto-reload disabled by design — skew recovery is handled by error boundaries
  // via attemptSkewRecoveryReload() (bounded, once per session).
  throw lastError;
}

export function lazyWithRetry(
  importFn: () => Promise<{ default: ComponentType<unknown> }>,
): LazyExoticComponent<ComponentType<unknown>> {
  return lazy(() => importWithRetry(importFn));
}
