import type { ComponentType, LazyExoticComponent } from "react";
import {
  importWithRetry,
  lazyWithRetry,
  POST_LOGIN_IDLE_PREFETCH_TAB_PATHS,
  POST_LOGIN_PREFETCH_TAB_PATHS,
} from "@/lib/chunkLoadRetry";
import { shouldElectronMountOnlyActiveTab } from "@/lib/electronShell";

export { POST_LOGIN_PREFETCH_TAB_PATHS };

export type TabPageLayout = "layout" | "fullscreen" | "pos";
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
    layout: "layout",
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
  "net-profit-analysis": {
    loader: () => import("@/pages/NetProfitAnalysis"),
    layout: "fullscreen",
    roles: ["admin", "manager"],
  },
  "einvoice-report": { loader: () => import("@/pages/EInvoiceReport"), layout: "layout" },
  "customer-ledger-report": { loader: () => import("@/pages/CustomerLedgerReport"), layout: "layout" },
  "customer-account-statement": { loader: () => import("@/pages/CustomerLedgerPage"), layout: "layout" },
  "customer-account-statement-audit": {
    loader: () => import("@/pages/CustomerAccountStatementAuditPage"),
    layout: "layout",
  },
  "customer-balance-activity": {
    loader: () => import("@/pages/CustomerBalanceActivityPage"),
    layout: "layout",
  },
  "customer-audit-report": { loader: () => import("@/pages/CustomerAuditReport"), layout: "layout" },
  "customer-reconciliation": {
    loader: () => import("@/pages/CustomerReconciliation"),
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
  "delivery-dashboard": { loader: () => import("@/pages/DeliveryDashboard"), layout: "layout" },
  "barcode-printing": { loader: () => import("@/pages/BarcodePrinting"), layout: "layout" },
  settings: { loader: () => import("@/pages/Settings"), layout: "layout", roles: ["admin"] },
  "audit-log": {
    loader: () => import("@/pages/AuditLog"),
    layout: "layout",
    roles: ["admin", "manager"],
  },
  "user-rights": { loader: () => import("@/pages/UserRights"), layout: "layout", roles: ["admin"] },
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

const prefetchCache = new Map<string, Promise<unknown>>();

export function isTabCachePath(path: string): boolean {
  return Boolean(TAB_PAGE_REGISTRY[path]);
}

export function prefetchTabPage(path: string): void {
  const def = TAB_PAGE_REGISTRY[path];
  if (!def || prefetchCache.has(path)) return;
  const promise = importWithRetry(def.loader).catch((err) => {
    prefetchCache.delete(path);
    console.warn(`[prefetch] Failed to load tab chunk: ${path}`, err);
  });
  prefetchCache.set(path, promise);
}

/** Drop cached lazy/prefetch state so the next mount re-fetches the chunk. */
export function resetTabPageChunk(path: string): void {
  prefetchCache.delete(path);
  lazyCache.delete(path);
}

/** Warm bill-entry chunks after login (reduces first-open failures in desktop WebView). */
export function prefetchPostLoginCriticalPages(): void {
  POST_LOGIN_PREFETCH_TAB_PATHS.forEach(prefetchTabPage);
}

/** Warm heavy admin chunks when the browser is idle (Settings first-open timeout). */
export function prefetchPostLoginIdlePages(): void {
  const run = () => POST_LOGIN_IDLE_PREFETCH_TAB_PATHS.forEach(prefetchTabPage);
  if (typeof requestIdleCallback !== "undefined") {
    requestIdleCallback(run, { timeout: 12_000 });
  } else {
    window.setTimeout(run, 4000);
  }
}

export function prefetchTabPages(paths: string[]): void {
  paths.forEach(prefetchTabPage);
}

/** Prefetch the active tab immediately; load other open tabs when the browser is idle. */
export function prefetchTabPagesIdle(paths: string[], activePath: string): () => void {
  if (isTabCachePath(activePath)) prefetchTabPage(activePath);
  // Electron: prefetch only the visible tab — idle prefetch of many chunks can spike memory.
  if (shouldElectronMountOnlyActiveTab()) return () => {};
  const rest = paths.filter((p) => isTabCachePath(p) && p !== activePath);
  if (rest.length === 0) return () => {};

  const run = () => rest.forEach(prefetchTabPage);
  if (typeof requestIdleCallback !== "undefined") {
    const id = requestIdleCallback(run, { timeout: 5000 });
    return () => cancelIdleCallback(id);
  }
  const t = window.setTimeout(run, 2500);
  return () => window.clearTimeout(t);
}

const lazyCache = new Map<string, LazyExoticComponent<ComponentType<unknown>>>();

export function getLazyTabPage(path: string): LazyExoticComponent<ComponentType<unknown>> | null {
  const def = TAB_PAGE_REGISTRY[path];
  if (!def) return null;
  let cached = lazyCache.get(path);
  if (!cached) {
    cached = lazyWithRetry(def.loader);
    lazyCache.set(path, cached);
  }
  return cached;
}
