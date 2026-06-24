import {
  beginUserPriorityLoad,
  importWithRetry,
  pauseBackgroundPrefetch,
} from "@/lib/chunkLoadRetry";

type ProductEntryDialogModule = typeof import("@/components/ProductEntryDialog");

let loadPromise: Promise<ProductEntryDialogModule> | null = null;

/** UI timeout — show retry before importWithRetry's 60s module timeout. */
export const PRODUCT_ENTRY_DIALOG_UI_TIMEOUT_MS = 20_000;

function startProductEntryDialogImport(): Promise<ProductEntryDialogModule> {
  const promise = importWithRetry(() => import("@/components/ProductEntryDialog")).catch((err) => {
    // Allow a fresh import on next open / retry (matches tabPageRegistry prefetch pattern).
    loadPromise = null;
    throw err;
  });
  loadPromise = promise;
  return promise;
}

/** Warm the Add Product dialog chunk (call on Purchase Entry idle / button hover). */
export function prefetchProductEntryDialog(): void {
  if (!loadPromise) {
    startProductEntryDialogImport();
  }
}

/**
 * User opened Add Product — yield bandwidth from post-login prefetch and start load if needed.
 * Returns a disposer to call when the dialog closes or load completes.
 */
export function beginProductEntryDialogPriorityLoad(): () => void {
  pauseBackgroundPrefetch(60_000);
  prefetchProductEntryDialog();
  return beginUserPriorityLoad();
}

/** Load dialog module with retry — used by React.lazy. */
export function loadProductEntryDialog(): Promise<{ default: ProductEntryDialogModule["ProductEntryDialog"] }> {
  prefetchProductEntryDialog();
  return loadPromise!.then((m) => ({ default: m.ProductEntryDialog }));
}

/** Clear cached import so Retry can fetch a fresh chunk after deploy / cache mismatch / timeout. */
export function resetProductEntryDialogChunk(): void {
  loadPromise = null;
}
