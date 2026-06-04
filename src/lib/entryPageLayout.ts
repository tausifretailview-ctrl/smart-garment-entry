/** Bill / voucher entry routes that should use the full viewport (no sidebar gutter). */
export const ENTRY_FULLSCREEN_PATH =
  /\/(sales-invoice|purchase-entry|sale-return-entry|purchase-return-entry|quotation-entry|sale-order-entry|delivery-challan-entry|purchase-order-entry)(\/|$)/;

export function isEntryFullscreenPath(pathname: string): boolean {
  return ENTRY_FULLSCREEN_PATH.test(pathname);
}

/** Outer shell for desktop bill entry screens (height clears fixed status bar via CSS var) */
export const entryPageShellClass =
  "h-[calc(100dvh-var(--erp-status-bar-height,1.5rem))] max-lg:h-dvh w-full max-w-none flex flex-col overflow-hidden box-border";

/** Horizontal padding for entry sections — tighter than px-6 to use screen width */
export const entryPageSectionX = "px-2 sm:px-3 lg:px-4";

/** Full-width page wrapper for entry screens inside FullScreenLayout (non–h-screen pages) */
export const entryPageContentClass = "w-full max-w-none mx-0 px-2 sm:px-3 lg:px-4 py-4 sm:py-5 space-y-4 sm:space-y-5";
