import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RELOAD_KEY = "chunk_reload_count";
const MAX_IMPORT_RETRIES = 3;
const RETRY_BASE_MS = 350;

/** Paths prefetched right after org login so first bill open does not cold-load a large chunk. */
export const POST_LOGIN_PREFETCH_TAB_PATHS = [
  "sales-invoice",
  "sales-invoice-dashboard",
  "purchase-entry",
  "purchase-bill-dashboard",
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
    msg.includes("Loading CSS chunk")
  );
}

/**
 * Retries transient chunk/network failures before a single guarded full reload.
 * Used by React.lazy and tab prefetch loaders (Windows WebView / PWA cold start).
 */
export async function importWithRetry<T>(importFn: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_IMPORT_RETRIES; attempt++) {
    try {
      return await importFn();
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

  const reloadCount = parseInt(
    sessionStorage.getItem(CHUNK_RELOAD_KEY) || "0",
    10,
  );
  if (isChunkLoadError(lastError) && reloadCount < 1) {
    sessionStorage.setItem(CHUNK_RELOAD_KEY, String(reloadCount + 1));
    window.location.reload();
    return new Promise(() => {});
  }

  throw lastError;
}

export function lazyWithRetry(
  importFn: () => Promise<{ default: ComponentType<unknown> }>,
): LazyExoticComponent<ComponentType<unknown>> {
  return lazy(() => importWithRetry(importFn));
}
