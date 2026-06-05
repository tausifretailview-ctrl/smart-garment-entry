import type { ComponentType, LazyExoticComponent } from "react";
import {
  importWithRetry,
  lazyWithRetry,
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
  "item-wise-sales": { loader: () => import("@/pages/ItemWiseSalesReport"), layout: "layout" },
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

/** Warm bill-entry chunks after login (reduces first-open failures in desktop WebView). */
export function prefetchPostLoginCriticalPages(): void {
  POST_LOGIN_PREFETCH_TAB_PATHS.forEach(prefetchTabPage);
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
