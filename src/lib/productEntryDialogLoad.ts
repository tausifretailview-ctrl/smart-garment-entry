import { importWithRetry } from "@/lib/chunkLoadRetry";

type ProductEntryDialogModule = typeof import("@/components/ProductEntryDialog");

let loadPromise: Promise<ProductEntryDialogModule> | null = null;

/** Warm the Add Product dialog chunk (call on Purchase Entry mount / button hover). */
export function prefetchProductEntryDialog(): void {
  if (!loadPromise) {
    loadPromise = importWithRetry(() => import("@/components/ProductEntryDialog"));
  }
}

/** Load dialog module with retry — used by React.lazy. */
export function loadProductEntryDialog(): Promise<{ default: ProductEntryDialogModule["ProductEntryDialog"] }> {
  prefetchProductEntryDialog();
  return loadPromise!.then((m) => ({ default: m.ProductEntryDialog }));
}

/** Clear cached import so Retry can fetch a fresh chunk after deploy / cache mismatch. */
export function resetProductEntryDialogChunk(): void {
  loadPromise = null;
}
