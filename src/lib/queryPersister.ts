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
] as const;

/** Skip live search, barcode, and auth keys — persist reference/dashboard data only. */
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

/** Changes every deploy — mismatched cache is discarded on restore. */
export const APP_BUILD_BUSTER =
  typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev";
