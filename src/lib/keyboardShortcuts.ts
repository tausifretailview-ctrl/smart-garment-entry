/** True when a modal/popover should block global shortcuts (not POS line-item focus). */
export function isGlobalShortcutBlocked(): boolean {
  return !!document.querySelector(
    '[role="dialog"], [role="alertdialog"], ' +
      '[data-radix-popper-content-wrapper], ' +
      '[data-state="open"][role="menu"], ' +
      '[data-state="open"][role="listbox"]',
  );
}

export function isPosSalesRoute(pathname: string): boolean {
  return /\/pos-sales(\/|$)/.test(pathname);
}
