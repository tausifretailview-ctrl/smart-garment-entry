import { lazy, type ComponentType, type LazyExoticComponent } from "react";

/** Legacy counter key — cleared on boot; superseded by one-shot session flag. */
const SKEW_RELOAD_KEY = "skew_reload_count";
/** Epoch-ms of last skew recovery reload (sessionStorage). */
const SKEW_RELOAD_AT_KEY = "skew_reload_at";
/**
 * Hashed chunk URL that already triggered a cache-busting reload.
 * One extra reload per dead file: the once-per-build guard was leaving POS on
 * "Something went wrong / Failed to fetch dynamically imported module" after
 * the first refresh still had the old POSSales-*.js URL.
 */
const CHUNK_URL_RECOVERY_KEY = "chunk_url_recovery";
/** Explicit one-shot flag — prevents reload loops after ChunkLoadError recovery. */
const CHUNK_RECOVERY_RELOADED_KEY = "chunk_recovery_reloaded";
/**
 * Build that ran the last automatic skew reload. One reload per build, not per tab
 * session: with several deploys a day, a PWA window that recovered once in the
 * morning otherwise showed "This tab failed to load" after every later deploy.
 */
const SKEW_RELOAD_BUILD_KEY = "skew_reload_build";

function currentAppBuildId(): string {
  return typeof __APP_BUILD_ID__ !== "undefined" ? __APP_BUILD_ID__ : "dev";
}
/**
 * One automatic full reload per build after deploy skew (stale hashed chunk 404),
 * see SKEW_RELOAD_BUILD_KEY.
 * A 2-minute cooldown plus a 1s post-boot reset produced an all-pages refresh loop.
 * Overnight / second-wave deploys surface the Update banner — user reloads when ready.
 */
export const SKEW_RELOAD_COOLDOWN_MS = 2 * 60 * 1000;
const MAX_IMPORT_RETRIES = 5;
const RETRY_BASE_MS = 500;
/** Per-attempt ceiling so a hung dynamic import cannot block Suspense forever.
 *  Raised from 25s → 60s because slow networks / Windows WebView cold starts
 *  legitimately need more time, and a false timeout dumps the user on the
 *  "This tab failed to load" screen. */
export const MODULE_LOAD_TIMEOUT_MS = 60_000;

/**
 * Eager post-login prefetch — ONLY the home dashboard + POS.
 * Everything else warms via `scheduleSequentialIdlePrefetch` so cold opens of
 * Purchase Bills / Purchase Entry are not starved by a 15+ chunk waterfall.
 */
export const POST_LOGIN_PREFETCH_TAB_PATHS = ["", "pos-sales"] as const;

/** Web/PWA critical warm — same slim set as Electron (active route wins bandwidth). */
export const POST_LOGIN_PREFETCH_TAB_PATHS_WEB = ["", "pos-sales"] as const;

/**
 * Outlet POS routes — warm purchase-entry while the cashier is on POS (SEMME:
 * POS → Purchase Entry is a common hop; purchase-entry stays off the parallel
 * post-login list to avoid starving cold dashboard opens).
 */
export const POS_CONTEXT_PURCHASE_PREFETCH_PATHS = ["pos-sales", "pos-delivery-challan"] as const;

/** Tab to warm from POS context (single hop, not full inventory list). */
export const POS_CONTEXT_WARM_TAB_PATH = "purchase-entry" as const;

/**
 * Former Electron critical paths — first wave of idle prefetch after login.
 * Kept sequential so they never race the visible tab.
 */
export const POST_LOGIN_ELECTRON_IDLE_PRIMARY_PREFETCH_TAB_PATHS = [
  "pos-dashboard",
  "sales-invoice",
  "sales-invoice-dashboard",
  "purchase-entry",
  "purchase-bill-dashboard",
  "stock-report",
  "customers",
  "suppliers",
  "product-dashboard",
  "product-entry",
  "purchase-return-entry",
  "sale-return-dashboard",
  "purchase-return-dashboard",
  "accounts",
  "products",
  "purchase-bills",
  "purchase-returns",
] as const;

/**
 * Inventory dashboards + bill-entry screens — warmed on browser idle after login
 * (web/PWA only). Entry chunks are large; without this, first open after idle shows
 * "Loading bill screen…" until the cold download finishes.
 */
/**
 * First idle wave after login. These three open most often and used to sit
 * behind six other inventory chunks (each gap after a 4s defer).
 */
export const POST_LOGIN_WEB_IDLE_PRIORITY_PREFETCH_TAB_PATHS = [
  "purchase-entry",
  "sales-invoice",
  "products",
  // Sales Invoice Dashboard: data is prefetched at login, so the chunk must not wait in the
  // deferred inventory queue or the first click shows a skeleton while it downloads.
  "sales-invoice-dashboard",
] as const;

/** Start the priority wave soon after login. The rest of the queue stays deferred. */
export const POST_LOGIN_WEB_IDLE_PRIORITY_DELAY_MS = 500;

export const POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS = [
  "product-dashboard",
  "purchase-bill-dashboard",
  "purchase-bills",
  "purchase-return-dashboard",
  "purchase-returns",
  "product-entry",
  "pos-dashboard",
  "sales-invoice-dashboard",
  "stock-report",
] as const;

/**
 * Admin / secondary modules that cold-load on web and show Suspense skeleton
 * ("Still loading… slow network") for 8s+. Warmed sequentially AFTER inventory
 * idle prefetch — not in the parallel critical set (avoids starving first click).
 */
export const POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS = [
  "settings",
  "user-rights",
  "recycle-bin",
  "accounts",
  "accounts-payments",
  "customer-account-statement",
  "customer-party-balances",
  "barcode-printing",
  "third-party-entry",
  "third-party-balances",
  "customers",
  // Pair with customers — Master tab switches (Customers ↔ Suppliers) must not cold-load.
  "suppliers",
  "payments-dashboard",
  "profile",
] as const;

/** Party masters — warm siblings while any one is open (desktop-like tab switch). */
export const MASTER_TAB_PREFETCH_PATHS = [
  "customers",
  "suppliers",
  "employees",
  "salesman-commission",
] as const;

/**
 * Inventory section — mutual intent-warm (same pattern as Sales POS ↔ Invoice).
 * Speculative prefetch is skipped on Save-Data/2g; siblings use intent:true.
 */
export const INVENTORY_TAB_PREFETCH_PATHS = [
  "products",
  "product-dashboard",
  "purchase-bills",
  "purchase-bill-dashboard",
  "purchase-returns",
  "purchase-return-dashboard",
  "purchase-entry",
  "product-entry",
  "purchase-orders",
  "purchase-return-entry",
  "bulk-product-update",
  "stock-settlement",
  "barcode-printing",
] as const;

/** Sales section dashboards — keep mutual warm explicit (locks current “no loading” UX). */
export const SALES_TAB_PREFETCH_PATHS = [
  "pos-dashboard",
  "sales-invoice-dashboard",
  "pos-sales",
  "pos-delivery-challan",
  "sales-invoice",
  "sale-returns",
  "sale-return-dashboard",
  "sale-return-entry",
  "quotation-dashboard",
  "quotation-entry",
  "sale-order-dashboard",
  "sale-order-entry",
  "delivery-challan-dashboard",
  "advance-booking-dashboard",
  "discount-scheme-dashboard",
] as const;

/** Accounts / payments / ledger — mutual warm (header + sidebar shortcuts). */
export const ACCOUNTS_TAB_PREFETCH_PATHS = [
  "accounts",
  "accounts-payments",
  "payments-dashboard",
  "customer-account-statement",
  "customer-party-balances",
  "customer-ledger-report",
  "chart-of-accounts",
  "third-party-balances",
  "ledger-opening-balances",
] as const;

/**
 * Re-warm after the browser tab was hidden/idle (module cache may have been discarded).
 * Web/PWA: all 7 long-budget Outlet entries plus purchase/product entry.
 * Electron wake/hover uses ELECTRON_CRITICAL_ENTRY_CHUNK_PATHS — do not grow that
 * list; sequential idle prefetch is the desktop warm path (memory-capped).
 */
export const CRITICAL_ENTRY_CHUNK_PATHS = [
  "purchase-entry",
  "product-entry",
  "pos-sales",
  "pos-delivery-challan",
  "sales-invoice",
  "sale-return-entry",
  "quotation-entry",
  "sale-order-entry",
  "purchase-return-entry",
  // Later: add mobile-pos when it uses the tab-cache registry (billing must not cold-load).
] as const;

/** Electron visibility/hover re-warm — original slim set. Idle prefetch stays sequential. */
export const ELECTRON_CRITICAL_ENTRY_CHUNK_PATHS = [
  "purchase-entry",
  "product-entry",
  "pos-sales",
  "pos-delivery-challan",
  "sales-invoice",
] as const;

export function criticalEntryChunkPathsForShell(electron: boolean): readonly string[] {
  return electron ? ELECTRON_CRITICAL_ENTRY_CHUNK_PATHS : CRITICAL_ENTRY_CHUNK_PATHS;
}

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
  "customer-points-report",
  "customer-account-statement",
  "customer-balance-activity",
  "customer-audit-report",
  "customer-reconciliation",
  "stock-reconciliation",
  "accounting-reports",
  "expense-salary-report",
  "cn-sr-adjustment-register",
  "gst-reports",
  "gst-register",
  "tally-export",
  "price-history",
  "product-tracking",
  "payments-dashboard",
  "delivery-dashboard",
  "delivery-challan-dashboard",
  "advance-booking-dashboard",
  "discount-scheme-dashboard",
  "purchase-orders",
  "salesman-commission",
  "bulk-product-update",
  "employees",
  "profile",
] as const;

/** JSON.parse failures (V8: "... is not valid JSON" / "in JSON at position"). */
function isJsonParseMessage(msg: string): boolean {
  return /\bjson\b/i.test(msg);
}

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
    // Deploy skew often serves index.html for a missing .js chunk ("Unexpected token '<'").
    // Do NOT match bare ReferenceError "X is not defined" — that is app code, not a chunk miss,
    // and treating it as skew caused "Updating…" + auto-reload (e.g. POS Flat Disc % click).
    // Do NOT match JSON.parse on an HTML body (API/gateway 502/504 page):
    // `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` is a data error, not a chunk miss,
    // and treating it as skew full-reloaded the app and wiped unsaved work.
    (/unexpected token '<'/i.test(msg) && !isJsonParseMessage(msg)) ||
    // Stale service-worker precache / old index.html: the missing hashed chunk is served
    // as the SPA fallback HTML, so the browser rejects the module on MIME type.
    /expected a javascript(-or-wasm)? module script/i.test(msg) ||
    /is not a valid javascript mime type/i.test(msg) ||
    /mime type of "text\/html"/i.test(msg) ||
    msg.includes("Module load timed out")
  );
}

/** Clears skew-recovery cooldown after a healthy boot. */
export function resetSkewReloadCount(): void {
  try {
    sessionStorage.removeItem(SKEW_RELOAD_KEY);
    sessionStorage.removeItem(SKEW_RELOAD_AT_KEY);
    sessionStorage.removeItem(CHUNK_RECOVERY_RELOADED_KEY);
    sessionStorage.removeItem(SKEW_RELOAD_BUILD_KEY);
  } catch {
    // ignore private mode / storage errors
  }
}

/**
 * Drop the service worker + Cache Storage so the reload cannot be served the same
 * stale index.html (which is what makes a hashed chunk 404 into text/html forever).
 */
async function purgeStaleAppCaches(chunkUrl?: string | null): Promise<void> {
  if (chunkUrl) await refreshChunkHttpCache(chunkUrl);
  try {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    }
    if (typeof caches !== "undefined") {
      const names = await caches.keys();
      await Promise.all(names.map((name) => caches.delete(name)));
    }
  } catch {
    // ignore — reload anyway
  }
}

/**
 * True when another automatic skew reload is allowed: once per build.
 * The build that already reloaded may not reload again (loop guard: a reload that
 * lands on the same stale build stops there). After the reload lands on a newer
 * build, the next deploy may recover once more.
 * Legacy flags written before the build key existed still block for that session.
 */
export function canAttemptSkewRecoveryReload(
  _nowMs = Date.now(),
  buildId: string = currentAppBuildId(),
): boolean {
  try {
    const reloadedFromBuild = sessionStorage.getItem(SKEW_RELOAD_BUILD_KEY);
    if (reloadedFromBuild) return reloadedFromBuild !== buildId;
    if (sessionStorage.getItem(CHUNK_RECOVERY_RELOADED_KEY) === "1") return false;
    const raw = sessionStorage.getItem(SKEW_RELOAD_AT_KEY);
    if (!raw) return true;
    const lastAt = parseInt(raw, 10);
    if (!Number.isFinite(lastAt) || lastAt <= 0) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Bounded full-page reload for deploy/version skew.
 * Once per build (see canAttemptSkewRecoveryReload). Further chunk 404s on the
 * same build stay on the current page (error UI / Update banner) instead of looping.
 * Returns true if reload was initiated (caller should show a brief splash).
 */
export function attemptSkewRecoveryReload(chunkUrl?: string | null): boolean {
  try {
    if (!canAttemptSkewRecoveryReload()) return false;
    sessionStorage.setItem(SKEW_RELOAD_BUILD_KEY, currentAppBuildId());
    sessionStorage.setItem(SKEW_RELOAD_AT_KEY, String(Date.now()));
    sessionStorage.setItem(CHUNK_RECOVERY_RELOADED_KEY, "1");
    // Keep legacy key in sync for older diagnostics / mid-rollout tabs.
    sessionStorage.setItem(SKEW_RELOAD_KEY, "1");
    void purgeStaleAppCaches(chunkUrl).finally(() => {
      window.location.reload();
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Navigate to this same screen with a new query so the browser cannot reuse a
 * year-long cached 404 for the previous hashed chunk.
 */
function reloadDocumentBypassingCache(): void {
  const next = new URL(window.location.href);
  next.searchParams.set("__ezzy_chunk", String(Date.now()));
  window.location.replace(next.toString());
}

/** Manual Refresh on a chunk-miss screen. Always hits the network. */
export function hardReloadAfterChunkMiss(): void {
  void purgeStaleAppCaches().finally(() => {
    try {
      reloadDocumentBypassingCache();
    } catch {
      window.location.reload();
    }
  });
}

/** True after this page started a chunk reload. A fresh document resets it. */
let chunkReloadStarted = false;

/** Keep the "Updating…" splash if another handler already started the reload. */
export function didStartChunkReload(): boolean {
  return chunkReloadStarted;
}

/**
 * Recover a stale dynamic import (POSSales-*.js 404 after deploy, or a dropped
 * shop download). The once-per-build reload runs first. If that already ran and
 * this exact file has not been retried, purge caches and load the document again.
 * The same URL is never auto-reloaded twice, so a still-missing file cannot loop.
 * Returns true when a reload was started (caller should keep the splash up).
 */
export function attemptStaleChunkRecovery(error: unknown): boolean {
  if (chunkReloadStarted) return true;
  const url = chunkUrlFromError(error);
  if (attemptSkewRecoveryReload(url)) {
    chunkReloadStarted = true;
    if (url) {
      try {
        sessionStorage.setItem(CHUNK_URL_RECOVERY_KEY, url);
      } catch {
        // reload already started
      }
    }
    return true;
  }
  if (!url) return false;
  try {
    if (sessionStorage.getItem(CHUNK_URL_RECOVERY_KEY) === url) return false;
    sessionStorage.setItem(CHUNK_URL_RECOVERY_KEY, url);
    chunkReloadStarted = true;
    void purgeStaleAppCaches(url).finally(() => {
      try {
        reloadDocumentBypassingCache();
      } catch {
        window.location.reload();
      }
    });
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

/** Longest the "is this chunk gone?" check may add before normal retries continue. */
const CHUNK_GONE_CHECK_TIMEOUT_MS = 4_000;

/**
 * Same-origin `/assets/*.js` URL named in a failed dynamic import message
 * (Chrome: "Failed to fetch dynamically imported module: https://…/assets/X-hash.js").
 * Null when the browser does not include the URL (Safari) or it is not an app chunk.
 */
export function chunkUrlFromError(error: unknown, origin?: string): string | null {
  const msg =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const match = msg.match(/(https?:\/\/[^\s'"]+?\.js|\/assets\/[^\s'"]+?\.js)/i);
  if (!match) return null;
  const base =
    origin ?? (typeof location !== "undefined" ? location.origin : undefined);
  if (!base) return null;
  try {
    const url = new URL(match[1], base);
    if (url.origin !== new URL(base).origin) return null;
    if (!url.pathname.startsWith("/assets/")) return null;
    return url.href;
  } catch {
    return null;
  }
}

/**
 * True only when the server says the chunk no longer exists (404/410, or an HTML
 * page instead of JS). That is deploy skew: the open page runs a build whose
 * files were replaced, and retrying the same URL can never succeed.
 * Any network error, timeout or 200 JS response returns false so the normal
 * retries still ride out a flaky shop connection.
 */
export async function isChunkGoneFromServer(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = CHUNK_GONE_CHECK_TIMEOUT_MS,
): Promise<boolean> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    // HEAD is not handled by the service worker's GET routes, so this asks the server.
    const res = await fetchImpl(url, {
      method: "HEAD",
      cache: "no-store",
      signal: controller?.signal,
    });
    if (res.status === 404 || res.status === 410) return true;
    const type = res.headers.get("content-type") || "";
    return res.ok && type.includes("text/html");
  } catch {
    return false;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Re-download one chunk past the browser's HTTP cache. /assets/* is served with a
 * 1-year immutable header, so a 404 caught during a deploy stays in the disk cache
 * and every retry or plain reload reuses it. cache: "reload" replaces that entry.
 */
export async function refreshChunkHttpCache(
  url: string,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = CHUNK_GONE_CHECK_TIMEOUT_MS,
): Promise<void> {
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  try {
    await fetchImpl(url, {
      cache: "reload",
      credentials: "same-origin",
      signal: controller?.signal,
    });
  } catch {
    // offline / aborted — the normal retries and reload still run
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * Retries transient chunk/network failures before a single guarded full reload.
 * Used by React.lazy and tab prefetch loaders (Windows WebView / PWA cold start).
 * When the first failure is a chunk the server no longer has (deploy skew), skip
 * the ~5s of pointless retries and reload onto the new build straight away.
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
      if (attempt === 0) {
        const url = chunkUrlFromError(error);
        if (url) {
          if (await isChunkGoneFromServer(url)) break;
          // Server has the file: the failure may be a cached 404 from a deploy window.
          await refreshChunkHttpCache(url);
        }
      }
      await new Promise((resolve) =>
        setTimeout(resolve, RETRY_BASE_MS * (attempt + 1)),
      );
    }
  }

  // Stale deploy / HTML-for-JS: recover immediately so the user never sits on
  // "Something went wrong" for a POSSales chunk the server no longer has.
  if (isChunkLoadError(lastError) && attemptStaleChunkRecovery(lastError)) {
    return new Promise<T>(() => {});
  }
  throw lastError;
}

export function lazyWithRetry(
  importFn: () => Promise<{ default: ComponentType<unknown> }>,
): LazyExoticComponent<ComponentType<unknown>> {
  return lazy(() => importWithRetry(importFn));
}

/** Defer post-login prefetch so the first screen the user opens wins bandwidth. */
export const POST_LOGIN_PREFETCH_DEFER_MS = 2_500;

/** Gap between sequential background chunk prefetches (avoids cold-start contention). */
export const BACKGROUND_PREFETCH_GAP_MS = 200;

let userPriorityLoadDepth = 0;
let backgroundPrefetchPausedUntil = 0;

/** True while a user-opened screen/chunk is loading — background prefetch must yield. */
export function isBackgroundPrefetchAllowed(): boolean {
  if (userPriorityLoadDepth > 0) return false;
  return Date.now() >= backgroundPrefetchPausedUntil;
}

/** Pause background prefetch briefly after user navigation (chunk + data fetches). */
export function pauseBackgroundPrefetch(ms = 30_000): void {
  backgroundPrefetchPausedUntil = Math.max(backgroundPrefetchPausedUntil, Date.now() + ms);
}

/**
 * Mark a user-initiated load (tab navigation, Add Product dialog, etc.).
 * Call the returned disposer when the load finishes.
 */
export function beginUserPriorityLoad(): () => void {
  userPriorityLoadDepth += 1;
  pauseBackgroundPrefetch();
  return () => {
    userPriorityLoadDepth = Math.max(0, userPriorityLoadDepth - 1);
  };
}

export type IdleWorkOptions = {
  /** Minimum delay before scheduling (e.g. post-login defer). */
  minDelay?: number;
  /** requestIdleCallback timeout — run even if the browser stays busy. */
  timeout?: number;
};

/** Run work on idle; re-checks background-prefetch gate before executing. */
export function scheduleIdleWork(
  work: () => void,
  options: IdleWorkOptions = {},
): () => void {
  const minDelay = options.minDelay ?? 0;
  const timeout = options.timeout ?? 12_000;
  let cancelled = false;
  let idleId = 0;
  let delayTimer = 0;
  let retryTimer = 0;

  const runWhenAllowed = () => {
    if (cancelled) return;
    if (!isBackgroundPrefetchAllowed()) {
      retryTimer = window.setTimeout(runWhenAllowed, BACKGROUND_PREFETCH_GAP_MS);
      return;
    }
    work();
  };

  const scheduleIdle = () => {
    if (cancelled) return;
    if (typeof requestIdleCallback !== "undefined") {
      idleId = requestIdleCallback(runWhenAllowed, { timeout });
    } else {
      retryTimer = window.setTimeout(runWhenAllowed, Math.min(timeout, 4_000));
    }
  };

  if (minDelay > 0) {
    delayTimer = window.setTimeout(scheduleIdle, minDelay);
  } else {
    scheduleIdle();
  }

  return () => {
    cancelled = true;
    if (delayTimer) window.clearTimeout(delayTimer);
    if (retryTimer) window.clearTimeout(retryTimer);
    if (idleId && typeof cancelIdleCallback !== "undefined") {
      cancelIdleCallback(idleId);
    }
  };
}

/** Run paths one-at-a-time on idle so they never starve an active user navigation. */
export function scheduleSequentialIdlePrefetch(
  paths: readonly string[],
  runPrefetch: (path: string) => void,
  options: IdleWorkOptions = {},
): () => void {
  let index = 0;
  let gapTimer = 0;
  let cancelled = false;

  const step = () => {
    if (cancelled || index >= paths.length) return;
    if (!isBackgroundPrefetchAllowed()) {
      gapTimer = window.setTimeout(step, BACKGROUND_PREFETCH_GAP_MS);
      return;
    }
    runPrefetch(paths[index]);
    index += 1;
    if (index < paths.length) {
      gapTimer = window.setTimeout(step, BACKGROUND_PREFETCH_GAP_MS);
    }
  };

  const cancelDefer = scheduleIdleWork(step, options);

  return () => {
    cancelled = true;
    if (gapTimer) window.clearTimeout(gapTimer);
    cancelDefer();
  };
}
