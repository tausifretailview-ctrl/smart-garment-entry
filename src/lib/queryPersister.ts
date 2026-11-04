import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import { createStore, del, get, set } from "idb-keyval";

const idbStore = createStore("ezzy-rq-cache", "persist");

const storage = {
  getItem: (key: string) => get<string>(key, idbStore),
  setItem: (key: string, value: string) => set(key, value, idbStore),
  removeItem: (key: string) => del(key, idbStore),
};

/** IndexedDB-backed persister — async, large cache, throttled writes. */
export const persister = createAsyncStoragePersister({
  storage,
  throttleTime: 2000,
  key: "EZZY_RQ_CACHE",
});

const VOLATILE_PREFIXES = [
  "pos-products",
  "customers-search",
  "customer-balances-search",
  "customer-search",
  "product-search",
  "stock-search",
  "product-by-barcode",
  "variant-lookup",
  "barcode-scan",
  "barcode-stock-scan",
  // Set/array of locked variants — Set dehydrates to {} and broke POS scan (.has).
  "open-settlement-variant-ids",
  // Godowns page summary is a Map — it dehydrates to {} and crashed the page (.get) after a reload.
  "godown-summary",
  // Customer Reconciliation ledger balances are a Map — same crash after a reload.
  "reconcile-ledger-balances",
  "purchase-return-linked-bills",
  "purchase-return-cn-amounts",
  "purchase-returns",
  "product-stock-movements",
  "stock-movements",
  "stock-adjustment-variants",
  // Stock Summary rows (up to 10k variants) — always refetched live, never persisted.
  "stock-summary",
  "floating-stock-search",
  "owner-low-stock",
  "todays-sales",
  "today-sales",
  "pos-dashboard-sales",
  "mobile-dashboard-today-sales",
  "payment-reconciliation",
  "customers-with-balance",
  "customer-invoices",
  "customer-invoice-voucher-splits",
  "employees",
  "expense-vouchers",
  "supplier-ledger",
  "suppliers",
  "supplier-balance-map",
  "auth",
  "session",
] as const;

function serializeQueryKey(queryKey: readonly unknown[]): string {
  return queryKey.map((part) => String(part ?? "")).join("\0").toLowerCase();
}

const LIVE_SEARCH_MARKERS = [
  "debouncedsearch",
  "searchterm",
  "searchquery",
  "payment-status",
  "paymentstatus",
] as const;

/**
 * Skip live search, barcode, and auth keys — persist reference/dashboard data only.
 * `product-catalog` is NOT volatile: restoring a large catalog (thousands of
 * rows) on cold open is main-thread JSON + React commit work. Dashboard
 * cards themselves only show RPC aggregates (product_count / stock qty).
 */
export function isVolatileOrSensitiveKey(queryKey: readonly unknown[]): boolean {
  const head = String(queryKey[0] ?? "").toLowerCase();
  const serialized = serializeQueryKey(queryKey);

  if (VOLATILE_PREFIXES.some((p) => head === p || head.startsWith(p))) {
    return true;
  }
  if (LIVE_SEARCH_MARKERS.some((m) => serialized.includes(m))) {
    return true;
  }
  if (/\bfilter\b/.test(head) || head.includes("-filter")) {
    return true;
  }
  return false;
}

/**
 * True when query data is, or directly holds, a Map or Set (for example `{ rows: Map }`).
 * JSON turns those into `{}`, so after a reload the page's `.get` / `.has` crashed
 * (Godowns page, e-way bill lists). Such queries are never saved; they load fresh.
 * Looks one level deep only, and never walks arrays, so it stays cheap on big lists.
 */
export function holdsMapOrSet(data: unknown): boolean {
  if (data instanceof Map || data instanceof Set) return true;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  for (const v of Object.values(data as Record<string, unknown>)) {
    if (v instanceof Map || v instanceof Set) return true;
  }
  return false;
}

/** Changes every deploy — mismatched cache is discarded on restore. */
export const APP_BUILD_BUSTER =
  typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev";

/** Character length of the dehydrated React Query blob. Null if IDB is empty or unreadable. */
export async function readPersistCacheCharLength(): Promise<number | null> {
  try {
    const value = await storage.getItem("EZZY_RQ_CACHE");
    return typeof value === "string" ? value.length : null;
  } catch {
    return null;
  }
}
