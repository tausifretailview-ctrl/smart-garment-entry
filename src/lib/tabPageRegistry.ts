import type { ComponentType, LazyExoticComponent } from "react";
import {
  attemptSkewRecoveryReload,
  importWithRetry,
  isChunkLoadError,
  lazyWithRetry,
  scheduleSequentialIdlePrefetch,
  CRITICAL_ENTRY_CHUNK_PATHS,
  criticalEntryChunkPathsForShell,
  POST_LOGIN_IDLE_PREFETCH_TAB_PATHS,
  POST_LOGIN_PREFETCH_TAB_PATHS,
  POST_LOGIN_PREFETCH_TAB_PATHS_WEB,
  POST_LOGIN_ELECTRON_IDLE_PRIMARY_PREFETCH_TAB_PATHS,
  POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS,
  POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS,
  MASTER_TAB_PREFETCH_PATHS,
  INVENTORY_TAB_PREFETCH_PATHS,
  SALES_TAB_PREFETCH_PATHS,
  ACCOUNTS_TAB_PREFETCH_PATHS,
} from "@/lib/chunkLoadRetry";
import { isElectronShell, shouldElectronMountOnlyActiveTab } from "@/lib/electronShell";
import { recordTabChunkLoadEvent } from "@/lib/pwaColdOpenDiagnostics";

export {
  CRITICAL_ENTRY_CHUNK_PATHS,
  POST_LOGIN_PREFETCH_TAB_PATHS,
  POST_LOGIN_PREFETCH_TAB_PATHS_WEB,
  POST_LOGIN_ELECTRON_IDLE_PRIMARY_PREFETCH_TAB_PATHS,
  POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS,
  MASTER_TAB_PREFETCH_PATHS,
  INVENTORY_TAB_PREFETCH_PATHS,
  SALES_TAB_PREFETCH_PATHS,
  ACCOUNTS_TAB_PREFETCH_PATHS,
};

export type TabPageLayout = "layout" | "fullscreen" | "pos" | "pos-dc";
export type TabPageRole = "admin" | "manager" | "user" | "platform_admin";

export type TabPageDef = {
  loader: () => Promise<{ default: ComponentType<unknown> }>;
  layout: TabPageLayout;
  roles?: TabPageRole[];
};

/** Paths that appear in the multi-window tab bar (see WindowTabsContext PAGE_CONFIG). */
export const TAB_PAGE_REGISTRY: Record<string, TabPageDef> = {
  "": { loader: () => import("@/pages/Index"), layout: "layout" },
  dashboard: { loader: () => import("@/pages/Index"), layout: "layout" },
  "pos-sales": { loader: () => import("@/pages/POSSales"), layout: "pos" },
  "pos-delivery-challan": { loader: () => import("@/pages/PosDeliveryChallan"), layout: "pos-dc" },
  "pos-dashboard": { loader: () => import("@/pages/POSDashboard"), layout: "fullscreen" },
  "sales-invoice": { loader: () => import("@/pages/SalesInvoice"), layout: "fullscreen" },
  "sales-invoice-dashboard": { loader: () => import("@/pages/SalesInvoiceDashboard"), layout: "fullscreen" },
  "quotation-entry": { loader: () => import("@/pages/QuotationEntry"), layout: "fullscreen" },
  "quotation-dashboard": { loader: () => import("@/pages/QuotationDashboard"), layout: "layout" },
  "sale-order-entry": { loader: () => import("@/pages/SaleOrderEntry"), layout: "fullscreen" },
  "sale-order-dashboard": { loader: () => import("@/pages/SaleOrderDashboard"), layout: "layout" },
  "sale-return-entry": { loader: () => import("@/pages/SaleReturnEntry"), layout: "fullscreen" },
  "sale-returns": { loader: () => import("@/pages/SaleReturnDashboard"), layout: "layout" },
  "sale-return-dashboard": { loader: () => import("@/pages/SaleReturnDashboard"), layout: "layout" },
  "purchase-entry": {
    loader: () => import("@/pages/PurchaseEntry"),
    layout: "fullscreen",
    roles: ["admin", "manager"],
  },
  "purchase-bill-dashboard": {
    loader: () => import("@/pages/PurchaseBillDashboard"),
    layout: "fullscreen",
    roles: ["admin", "manager"],
  },
  "purchase-return-entry": {
    loader: () => import("@/pages/PurchaseReturnEntry"),
    layout: "fullscreen",
    roles: ["admin", "manager"],
  },
  "purchase-return-dashboard": {
    loader: () => import("@/pages/PurchaseReturnDashboard"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "product-entry": { loader: () => import("@/pages/ProductEntry"), layout: "fullscreen" },
  "product-dashboard": { loader: () => import("@/pages/ProductDashboard"), layout: "layout" },
  customers: {
    loader: () => import("@/pages/CustomerMaster"),
    layout: "fullscreen",
    roles: ["admin", "manager"],
  },
  "accounting/customer": {
    loader: () => import("@/pages/CustomerAccountPage"),
    layout: "fullscreen",
    roles: ["admin", "manager"],
  },
  suppliers: {
    loader: () => import("@/pages/SupplierMaster"),
    layout: "fullscreen",
    roles: ["admin", "manager"],
  },
  employees: {
    loader: () => import("@/pages/EmployeeMaster"),
    layout: "fullscreen",
    roles: ["admin", "manager"],
  },
  "stock-report": { loader: () => import("@/pages/StockReport"), layout: "layout" },
  reports: { loader: () => import("@/pages/ReportsHub"), layout: "layout" },
  "stock-adjustment": {
    loader: () => import("@/pages/StockAdjustment"),
    layout: "layout",
    roles: ["admin"],
  },
  "stock-ageing": { loader: () => import("@/pages/StockAgeingReport"), layout: "layout" },
  "stock-settlement": {
    loader: () => import("@/pages/StockSettlement"),
    layout: "layout",
    roles: ["admin"],
  },
  "stock-analysis": { loader: () => import("@/pages/StockAnalysis"), layout: "layout" },
  "item-wise-sales": { loader: () => import("@/pages/ItemWiseSalesReport"), layout: "layout" },
  "item-wise-stock": { loader: () => import("@/pages/ItemWiseStockReport"), layout: "layout" },
  "sales-report-by-customer": { loader: () => import("@/pages/SalesReportByCustomer"), layout: "layout" },
  "purchase-report-by-supplier": {
    loader: () => import("@/pages/PurchaseReportBySupplier"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "price-history": {
    loader: () => import("@/pages/PriceHistoryReport"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "product-tracking": { loader: () => import("@/pages/ProductTrackingReport"), layout: "layout" },
  "daily-cashier-report": { loader: () => import("@/pages/DailyCashierReport"), layout: "layout" },
  "daily-tally": { loader: () => import("@/pages/DailyTallyDashboard"), layout: "layout" },
  "daily-sale-analysis": { loader: () => import("@/pages/DailySaleAnalysis"), layout: "layout" },
  "hourly-sales-analysis": { loader: () => import("@/pages/HourlySalesAnalysis"), layout: "layout" },
  "sales-analytics": { loader: () => import("@/pages/SalesAnalyticsDashboard"), layout: "layout" },
  // NOTE: `insights` is deliberately NOT registered here. Its route is gated by
  // MenuPermissionRoute("business_insights"); the tab registry only supports role
  // gating, so caching it would bypass that permission check. It stays on <Outlet>.
  "net-profit-analysis": {
    loader: () => import("@/pages/NetProfitAnalysis"),
    layout: "fullscreen",
    roles: ["admin", "manager"],
  },
  "einvoice-report": { loader: () => import("@/pages/EInvoiceReport"), layout: "layout" },
  "customer-ledger-report": { loader: () => import("@/pages/CustomerLedgerReport"), layout: "layout" },
  "customer-points-report": { loader: () => import("@/pages/CustomerPointsReport"), layout: "layout" },
  "customer-account-statement": { loader: () => import("@/pages/CustomerLedgerPage"), layout: "layout" },
  "customer-account-statement-audit": {
    loader: () => import("@/pages/CustomerAccountStatementAuditPage"),
    layout: "layout",
  },
  "customer-balance-activity": {
    loader: () => import("@/pages/CustomerBalanceActivityPage"),
    layout: "layout",
  },
  "customer-party-balances": {
    loader: () => import("@/pages/CustomerPartyBalancesPage"),
    layout: "layout",
  },
  "supplier-party-balances": {
    loader: () => import("@/pages/SupplierPartyBalancesPage"),
    layout: "layout",
  },
  "customer-audit-report": { loader: () => import("@/pages/CustomerAuditReport"), layout: "layout" },
  "customer-reconciliation": {
    loader: () => import("@/pages/CustomerReconciliation"),
    layout: "layout",
    roles: ["admin"],
  },
  "stock-reconciliation": {
    loader: () => import("@/pages/StockReconciliationReport"),
    layout: "layout",
    roles: ["admin"],
  },
  "accounting-reports": {
    loader: () => import("@/pages/AccountingReports"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "expense-salary-report": {
    loader: () => import("@/pages/ExpenseSalaryReport"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "gst-reports": {
    loader: () => import("@/pages/GSTReports"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "purchase-orders": {
    loader: () => import("@/pages/PurchaseOrderDashboard"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "delivery-challan-dashboard": {
    loader: () => import("@/pages/DeliveryChallanDashboard"),
    layout: "layout",
  },
  "advance-booking-dashboard": {
    loader: () => import("@/pages/AdvanceBookingDashboard"),
    layout: "layout",
  },
  "discount-scheme-dashboard": {
    loader: () => import("@/pages/DiscountSchemeDashboard"),
    layout: "layout",
  },
  "salesman-commission": {
    loader: () => import("@/pages/SalesmanCommission"),
    layout: "fullscreen",
    roles: ["admin", "manager"],
  },
  "bulk-product-update": {
    loader: () => import("@/pages/BulkProductUpdate"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  profile: { loader: () => import("@/pages/Profile"), layout: "layout" },
  "gst-register": {
    loader: () => import("@/pages/GSTSalePurchaseRegister"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "tally-export": {
    loader: () => import("@/pages/TallyExport"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "payments-dashboard": {
    loader: () => import("@/pages/PaymentsDashboard"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  accounts: {
    loader: () => import("@/pages/Accounts"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "accounts-payments": {
    loader: () => import("@/pages/AccountsPaymentsPage"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "chart-of-accounts": {
    loader: () => import("@/pages/accounts/ChartOfAccounts"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "journal-vouchers": {
    loader: () => import("@/pages/accounts/JournalVouchers"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "manual-journal": {
    loader: () => import("@/pages/accounts/ManualJournalEntry"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "third-party-entry": {
    loader: () => import("@/pages/accounts/ThirdPartyVoucherEntry"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "third-party-balances": {
    loader: () => import("@/pages/accounts/ThirdPartyBalancesPage"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "ledger-opening-balances": {
    loader: () => import("@/pages/accounts/LedgerOpeningBalances"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "delivery-dashboard": { loader: () => import("@/pages/DeliveryDashboard"), layout: "layout" },
  "barcode-printing": { loader: () => import("@/pages/BarcodePrinting"), layout: "layout" },
  settings: {
    loader: () => import("@/pages/Settings"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  website: {
    loader: () => import("@/pages/WebsiteSettings"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  backup: {
    loader: () => import("@/pages/BackupSettingsPage"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "audit-log": {
    loader: () => import("@/pages/AuditLog"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "user-rights": {
    loader: () => import("@/pages/UserRights"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
};

// URL-path aliases. App.tsx routes use shorter slugs (e.g. /products,
// /purchase-bills, /purchase-returns) while the legacy registry uses the
// longer "-dashboard" keys. Register both so visiting these URLs goes
// through the cached tab pane instead of remounting via <Outlet> every time.
// Same loader + layout + roles — no duplicate chunk.
const URL_ALIASES: Record<string, keyof typeof TAB_PAGE_REGISTRY> = {
  products: "product-dashboard",
  "purchase-bills": "purchase-bill-dashboard",
  "purchase-returns": "purchase-return-dashboard",
  // Shorter sidebar slugs that map to the long registry keys.
  "sales-report": "sales-report-by-customer",
  "purchase-report": "purchase-report-by-supplier",
};
for (const [alias, target] of Object.entries(URL_ALIASES)) {
  if (!TAB_PAGE_REGISTRY[alias] && TAB_PAGE_REGISTRY[target]) {
    TAB_PAGE_REGISTRY[alias] = TAB_PAGE_REGISTRY[target];
  }
}

/**
 * Legacy tab-bar / registry slugs → canonical App.tsx route segment.
 * Tab cache + window tabs use the short route; registry still loads the same chunk.
 */
const TAB_CACHE_CANONICAL_PATH: Record<string, string> = {
  "purchase-bill-dashboard": "purchase-bills",
  "product-dashboard": "products",
  "purchase-return-dashboard": "purchase-returns",
  "sales-report-by-customer": "sales-report",
  "purchase-report-by-supplier": "purchase-report",
};

/** Resolve URL / window-tab segment to the single tab-cache key for that page. */
export function resolveTabCachePath(path: string): string {
  if (!path) return path;
  // Call sites often pass "/purchase-entry"; registry keys are slash-less.
  // Without this, prefetchTabPage("/purchase-entry") is a silent no-op.
  const bare = path.startsWith("/") ? path.slice(1) : path;
  return TAB_CACHE_CANONICAL_PATH[bare] ?? bare;
}

type TabPageModule = { default: ComponentType<unknown> };
const prefetchCache = new Map<string, Promise<TabPageModule>>();
/** When each in-flight prefetch was started (ms). Used to drop stale hung imports. */
const prefetchStartedAt = new Map<string, number>();
/** Tab paths whose lazy chunk module is already resolved in memory. */
const loadedChunkPaths = new Set<string>();

/** True when the page chunk is already downloaded — it can mount synchronously. */
export function isTabPageChunkLoaded(path: string): boolean {
  return loadedChunkPaths.has(resolveTabCachePath(path));
}

/** True when loadTabPageModule has started and has not yet resolved or failed. */
export function isTabPageChunkInFlight(path: string): boolean {
  const resolved = resolveTabCachePath(path);
  return prefetchCache.has(resolved) && !loadedChunkPaths.has(resolved);
}

export function isTabCachePath(path: string): boolean {
  return Boolean(TAB_PAGE_REGISTRY[path]) || Boolean(TAB_PAGE_REGISTRY[resolveTabCachePath(path)]);
}

function loadTabPageModule(path: string): Promise<TabPageModule> | null {
  const resolved = resolveTabCachePath(path);
  const def = TAB_PAGE_REGISTRY[resolved];
  if (!def) return null;
  const existing = prefetchCache.get(resolved);
  if (existing) return existing;

  prefetchStartedAt.set(resolved, Date.now());
  recordTabChunkLoadEvent(resolved, "start");
  const promise = importWithRetry(def.loader)
    .then((mod) => {
      loadedChunkPaths.add(resolved);
      recordTabChunkLoadEvent(resolved, "resolved");
      return mod;
    })
    .catch((err) => {
      prefetchCache.delete(resolved);
      recordTabChunkLoadEvent(resolved, "failed");
      throw err;
    })
    .finally(() => {
      prefetchStartedAt.delete(resolved);
    });
  prefetchCache.set(resolved, promise);
  return promise;
}

export type PrefetchTabPageOptions = {
  /**
   * User is about to navigate (pointerdown / touch). Always warm the chunk.
   * Speculative (hover / idle) respects Save-Data / 2g.
   */
  intent?: boolean;
};

type NetInfo = { effectiveType?: string; saveData?: boolean };

/** Speculative hover/idle warm — skip on Save-Data or 2g so the visible tab keeps bandwidth. */
export function shouldAllowSpeculativeChunkPrefetch(): boolean {
  if (isElectronShell()) return true;
  try {
    const conn = (navigator as Navigator & { connection?: NetInfo }).connection;
    if (!conn) return true;
    if (conn.saveData) return false;
    if (conn.effectiveType === "slow-2g" || conn.effectiveType === "2g") return false;
    return true;
  } catch {
    return true;
  }
}

/**
 * Warm a tab chunk via the shared promise cache (deduped).
 * Soft network blips stay silent. Deploy-skew (HTML-for-JS / MIME) only triggers a
 * bounded SW purge + reload for intent prefetch (user is about to navigate).
 * Speculative hover/idle warms must never reload under the user — with frequent
 * production deploys that reloads a working screen mid-work. The next real
 * navigation still recovers via the tab / root error boundaries.
 */
export function prefetchTabPage(path: string, options?: PrefetchTabPageOptions): void {
  const intent = Boolean(options?.intent);
  if (!intent && !shouldAllowSpeculativeChunkPrefetch()) return;
  const resolved = resolveTabCachePath(path);
  const promise = loadTabPageModule(resolved);
  if (!promise) return;
  void promise.catch((err) => {
    if (!isChunkLoadError(err)) return;
    if (intent) {
      attemptSkewRecoveryReload();
      return;
    }
    console.warn(
      `[chunk-skew] speculative prefetch failed for "${resolved}" — no reload (intent=false)`,
      err,
    );
  });
}

/**
 * Collapse a prefetch list to the chunks that actually still need downloading:
 * resolve URL aliases (products / product-dashboard → one chunk), drop repeats
 * across lists, and skip anything already downloaded or in flight.
 * Without this the sequential idle queue spends slots re-requesting warm chunks
 * and delays the genuinely cold ones (barcode-printing, purchase-entry).
 */
export function dedupeTabPrefetchPaths(paths: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    const resolved = resolveTabCachePath(p);
    if (!resolved || seen.has(resolved)) continue;
    seen.add(resolved);
    if (loadedChunkPaths.has(resolved) || prefetchCache.has(resolved)) continue;
    if (!TAB_PAGE_REGISTRY[resolved]) continue;
    out.push(resolved);
  }
  return out;
}

/** Warm purchase/product/POS entry chunks (login idle + after tab wake from idle). */
export function prefetchCriticalEntryChunks(): void {
  // Electron: keep the slim wake set. Expanding CRITICAL_ENTRY_CHUNK_PATHS is web/PWA only —
  // desktop idle prefetch is sequential and memory-capped (see prefetchTabPagesIdle).
  const list = criticalEntryChunkPathsForShell(isElectronShell());
  dedupeTabPrefetchPaths(list).forEach((p) => prefetchTabPage(p));
}

/** Drop cached lazy/prefetch state so the next mount re-fetches the chunk. */
export function resetTabPageChunk(path: string): void {
  const resolved = resolveTabCachePath(path);
  prefetchCache.delete(resolved);
  prefetchStartedAt.delete(resolved);
  lazyCache.delete(resolved);
  loadedChunkPaths.delete(resolved);
}

/**
 * If a background prefetch for this path has been in-flight longer than maxAgeMs
 * without resolving, drop our bookkeeping so the next getLazyTabPage / Suspense
 * remount starts a fresh importWithRetry. (Browsers may still share a hung
 * module promise for the same URL — soft remount + Reload remain the escape hatch.)
 */
export function refreshStaleInFlightTabChunk(path: string, maxAgeMs = 12_000): boolean {
  const resolved = resolveTabCachePath(path);
  if (loadedChunkPaths.has(resolved)) return false;
  if (!prefetchCache.has(resolved)) return false;
  const started = prefetchStartedAt.get(resolved);
  if (started == null) return false;
  if (Date.now() - started < maxAgeMs) return false;
  console.warn(
    `[tabPageRegistry] Refreshing stale in-flight chunk "${resolved}" after ${Math.round((Date.now() - started) / 1000)}s`,
  );
  resetTabPageChunk(resolved);
  return true;
}

/** Warm bill-entry chunks after login (reduces first-open failures in desktop WebView). */
export function prefetchPostLoginCriticalPages(): void {
  // Web/PWA: slim list to avoid cold-start chunk waterfall.
  // Desktop (Electron): keep the full warm list — chunks are local files.
  const list = isElectronShell()
    ? POST_LOGIN_PREFETCH_TAB_PATHS
    : POST_LOGIN_PREFETCH_TAB_PATHS_WEB;
  dedupeTabPrefetchPaths(list).forEach((p) => prefetchTabPage(p));
}

/**
 * Warm heavy / inventory / admin chunks when idle — one-at-a-time, gated by
 * `isBackgroundPrefetchAllowed` so a user click can pause the queue.
 * (Web critical warm stays parallel via `prefetchPostLoginCriticalPages`.)
 * Web: inventory first, then admin (settings, accounts, third-party, …).
 */
export function prefetchPostLoginIdlePages(): () => void {
  const paths = isElectronShell()
    ? ([
        ...POST_LOGIN_ELECTRON_IDLE_PRIMARY_PREFETCH_TAB_PATHS,
        ...POST_LOGIN_IDLE_PREFETCH_TAB_PATHS,
      ] as const)
    : ([
        ...POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS,
        ...POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS,
      ] as const);
  // Critical warm already ran — only queue chunks that are still cold.
  const queue = dedupeTabPrefetchPaths(paths);
  if (queue.length === 0) return () => {};
  return scheduleSequentialIdlePrefetch(queue, (path) => prefetchTabPage(path), {
    minDelay: isElectronShell() ? 0 : 4_000,
    timeout: 12_000,
  });
}

export function prefetchTabPages(paths: string[]): void {
  dedupeTabPrefetchPaths(paths).forEach((p) => prefetchTabPage(p));
}

/** Prefetch the active tab immediately; load other open tabs when the browser is idle. */
export function prefetchTabPagesIdle(paths: string[], activePath: string): () => void {
  const resolvedActive = resolveTabCachePath(activePath);
  if (isTabCachePath(resolvedActive)) prefetchTabPage(resolvedActive);
  // Electron: prefetch only the visible tab — idle prefetch of many chunks can spike memory.
  if (shouldElectronMountOnlyActiveTab()) return () => {};
  const rest = dedupeTabPrefetchPaths(paths).filter((p) => p !== resolvedActive);
  if (rest.length === 0) return () => {};

  // Web/PWA: skip background prefetch on Save-Data / 2g so the visible tab keeps bandwidth.
  if (!shouldAllowSpeculativeChunkPrefetch()) {
    return () => {};
  }

  const run = () => rest.forEach((p) => prefetchTabPage(p));
  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(run, { timeout: 12_000 });
    return () => cancelIdleCallback(id);
  }
  const t = window.setTimeout(run, 5000);
  return () => window.clearTimeout(t);
}

const lazyCache = new Map<string, LazyExoticComponent<ComponentType<unknown>>>();

export function getLazyTabPage(path: string): LazyExoticComponent<ComponentType<unknown>> | null {
  const resolved = resolveTabCachePath(path);
  const def = TAB_PAGE_REGISTRY[resolved];
  if (!def) return null;
  let cached = lazyCache.get(resolved);
  if (!cached) {
    cached = lazyWithRetry(async () => {
      const pending = loadTabPageModule(resolved);
      if (!pending) throw new Error(`Unknown tab page: ${resolved}`);
      const mod = await pending;
      return mod;
    });
    lazyCache.set(resolved, cached);
  }
  return cached;
}
