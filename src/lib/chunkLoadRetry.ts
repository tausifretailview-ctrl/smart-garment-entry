import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RELOAD_KEY = "chunk_reload_count";
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
  "sale-return-dashboard",
  "purchase-return-dashboard",
  "accounts",
  // URL-slug aliases used in App.tsx routes (resolved to the same chunks)
  "products",
  "purchase-bills",
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
  const msg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  return (
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("Importing a module script failed") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("Loading chunk") ||
    msg.includes("Loading CSS chunk") ||
    msg.includes("Module load timed out")
  );
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

  // Auto-reload disabled by design — user wants tabs to stay put. The
  // TabPaneErrorBoundary / Suspense fallback exposes a manual "Retry tab"
  // and "Refresh app" button so the user controls when (or if) to reload.
  throw lastError;
}

export function lazyWithRetry(
  importFn: () => Promise<{ default: ComponentType<unknown> }>,
): LazyExoticComponent<ComponentType<unknown>> {
  return lazy(() => importWithRetry(importFn));
}
