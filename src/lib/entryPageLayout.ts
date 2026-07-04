/** Bill / voucher entry routes that should use the full viewport (no sidebar gutter). */
export const ENTRY_FULLSCREEN_PATH =
  /\/(sales-invoice|purchase-entry|sale-return-entry|purchase-return-entry|quotation-entry|sale-order-entry|delivery-challan-entry|purchase-order-entry)(\/|$)/;

/** POS + primary bill entry — full viewport: no sidebar or global header; window tab strip stays visible. */
export const NO_SIDEBAR_ENTRY_PATH =
  /\/(pos-sales|sales-invoice|purchase-entry)(\/|$)/;

export function isEntryFullscreenPath(pathname: string): boolean {
  return ENTRY_FULLSCREEN_PATH.test(pathname);
}

export function isNoSidebarEntryPath(pathname: string): boolean {
  return NO_SIDEBAR_ENTRY_PATH.test(pathname);
}

/** Full-height workspace pages (inbox, chat) — fill shell viewport, no outer page scroll. */
export const FILL_HEIGHT_WORKSPACE_PATH = /\/(whatsapp-inbox)(\/|$)/;

export function isFillHeightWorkspacePath(pathname: string): boolean {
  return FILL_HEIGHT_WORKSPACE_PATH.test(pathname);
}

/** List dashboards with fixed header/cards and an internal scrolling table. */
export const FILL_HEIGHT_DASHBOARD_PATH =
  /\/(pos-dashboard|sales-invoice-dashboard|purchase-bills|purchase-bill-dashboard|accounts|accounts-payments|customer-party-balances|supplier-party-balances|stock-report|item-wise-sales|item-wise-stock|customer-master|net-profit-analysis|reports|insights)(\/|$)/;

export function isFillHeightDashboardPath(pathname: string): boolean {
  return FILL_HEIGHT_DASHBOARD_PATH.test(pathname);
}

export function isFillHeightShellPath(pathname: string): boolean {
  return isFillHeightWorkspacePath(pathname) || isFillHeightDashboardPath(pathname);
}

/** Sidebar + content only — hide global header menu and window tab strip (e.g. Customer Balances, Accounts). */
export const SIDEBAR_ONLY_WORKSPACE_PATH =
  /\/(customer-party-balances|supplier-party-balances|stock-report|accounts|accounts-payments|item-wise-sales|item-wise-stock|net-profit-analysis|insights)(\/|$)/;

export function isSidebarOnlyWorkspacePath(pathname: string): boolean {
  return SIDEBAR_ONLY_WORKSPACE_PATH.test(pathname);
}

export function isNoSidebarEntrySegment(pathSegment: string): boolean {
  const segment = pathSegment.replace(/^\/+|\/+$/g, "");
  return segment === "pos-sales" || segment === "sales-invoice" || segment === "purchase-entry";
}

/** Org path segment for bill/POS entry — excluded from tab cache (needs FullScreenLayout + h-dvh). */
export function isEntryTabPath(pathSegment: string): boolean {
  const segment = pathSegment.replace(/^\/+|\/+$/g, "");
  if (!segment) return false;
  return ENTRY_FULLSCREEN_PATH.test(`/${segment}/`);
}

/** Entry routes allowed in TabCachedPages (stay mounted on in-app tab switch). */
export const CACHEABLE_ENTRY_PATHS = new Set(["purchase-entry"]);

export function isCacheableEntryTabPath(pathSegment: string): boolean {
  const segment = pathSegment.replace(/^\/+|\/+$/g, "");
  return CACHEABLE_ENTRY_PATHS.has(segment);
}

/** Height reserved for the fixed desktop status bar (see .erp-status-bar in index.css). */
export const ERP_STATUS_BAR_HEIGHT_CLASS = "lg:pb-[var(--erp-status-bar-height,1.75rem)]";

/**
 * FullScreenLayout <main> for bill entry — flex column so header/main/footer fill viewport.
 */
export const entryPageLayoutMainClass =
  "flex flex-1 flex-col min-h-0 min-w-0 h-full w-full overflow-hidden";

/** Outer shell: header + scrollable lines + footer pinned to bottom (POS-style fixed shell). */
export const entryPageShellClass =
  "flex flex-1 flex-col min-h-0 w-full max-w-none";

/** Line items table scrolls; header/footer sections stay shrink-0. */
export const entryPageMainClass = "flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden";

/** Horizontal padding for entry sections — tighter than px-6 to use screen width */
export const entryPageSectionX = "px-2 sm:px-3 lg:px-4";

/** Full-width page wrapper for entry screens inside FullScreenLayout (non–h-screen pages) */
export const entryPageContentClass = "w-full max-w-none mx-0 px-2 sm:px-3 lg:px-4 py-4 sm:py-5 space-y-4 sm:space-y-5";
