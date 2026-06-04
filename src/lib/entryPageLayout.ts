/** Bill / voucher entry routes that should use the full viewport (no sidebar gutter). */
export const ENTRY_FULLSCREEN_PATH =
  /\/(sales-invoice|purchase-entry|sale-return-entry|purchase-return-entry|quotation-entry|sale-order-entry|delivery-challan-entry|purchase-order-entry)(\/|$)/;

export function isEntryFullscreenPath(pathname: string): boolean {
  return ENTRY_FULLSCREEN_PATH.test(pathname);
}

/** Height reserved for the fixed desktop status bar (see .erp-status-bar in index.css). */
export const ERP_STATUS_BAR_HEIGHT_CLASS = "lg:pb-[var(--erp-status-bar-height,1.75rem)]";

/** Outer shell for desktop bill entry screens — h-full fits the layout flex slot (not 100vh, which clips the footer on Windows). */
export const entryPageShellClass =
  `h-full min-h-0 w-full max-w-none flex flex-col min-w-0 ${ERP_STATUS_BAR_HEIGHT_CLASS}`;

/** Scrollable bill lines live in <main>; shell must not clip the header toolbar (New / Save). */
export const entryPageMainClass = "flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden";

/** Horizontal padding for entry sections — tighter than px-6 to use screen width */
export const entryPageSectionX = "px-2 sm:px-3 lg:px-4";

/** Full-width page wrapper for entry screens inside FullScreenLayout (non–h-screen pages) */
export const entryPageContentClass = "w-full max-w-none mx-0 px-2 sm:px-3 lg:px-4 py-4 sm:py-5 space-y-4 sm:space-y-5";
