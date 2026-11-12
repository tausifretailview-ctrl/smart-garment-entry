/**
 * POS keeps the cursor in the barcode box between scans. A picker that closes (e.g. the header
 * Salesperson search) sends it back there, but must not do so when the cashier closed the picker
 * by clicking into another field: pulling focus away from a native <select> (a cart line's
 * salesman list) shuts its list the moment it opens.
 */

/** True when the cursor is now in another field the cashier chose (not the barcode box). */
export function posFocusMovedToOtherField(
  active: Element | null,
  barcodeInput: Element | null,
  /** Root of the picker that is closing; focus still inside it does not count as "moved". */
  closingRootSelector?: string,
): boolean {
  if (!active || active === barcodeInput) return false;
  if (closingRootSelector && active.closest(closingRootSelector)) return false;
  const tag = active.tagName;
  if (tag === "SELECT" || tag === "TEXTAREA" || tag === "INPUT") return true;
  return (active as HTMLElement).isContentEditable === true;
}
