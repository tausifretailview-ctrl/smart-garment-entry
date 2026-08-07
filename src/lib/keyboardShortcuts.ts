/** True when a modal/popover should block global shortcuts (not POS line-item focus). */
export function isGlobalShortcutBlocked(): boolean {
  return !!document.querySelector(
    '[role="dialog"], [role="alertdialog"], ' +
      '[data-radix-popper-content-wrapper], ' +
      '[data-state="open"][role="menu"], ' +
      '[data-state="open"][role="listbox"]',
  );
}

/** True when focus is in a field that should receive keystrokes (barcode / typing). */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  if (target.isContentEditable) return true;
  return Boolean(target.closest("[contenteditable='true']"));
}

export function isPosSalesRoute(pathname: string): boolean {
  return /\/pos-sales(\/|$)/.test(pathname);
}
