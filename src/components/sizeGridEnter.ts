/**
 * Sale Order size grid: Enter walks size qty boxes, then lands on Add.
 * Confirm stays on Ctrl+A (and Enter once Add is focused).
 */
export function advanceSizeQtyFocus(current: HTMLElement): boolean {
  if (current.getAttribute("data-size-qty") !== "1") return false;
  const dialog = current.closest('[role="dialog"]');
  if (!dialog) return false;

  const inputs = Array.from(
    dialog.querySelectorAll<HTMLInputElement>('input[data-size-qty="1"]'),
  );
  const index = inputs.indexOf(current as HTMLInputElement);
  if (index < 0) return false;

  const next: HTMLElement | null =
    index < inputs.length - 1
      ? inputs[index + 1]
      : dialog.querySelector<HTMLButtonElement>("[data-size-grid-add]");
  if (!next) return false;

  next.focus();
  if (next instanceof HTMLInputElement) next.select();
  return true;
}
