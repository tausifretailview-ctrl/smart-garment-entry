/**
 * POS salesman retain / commission guards (pure — unit-tested).
 */

/** When false, clear salesman after every successful save (all save paths alike). */
export function shouldClearPosSalesmanAfterSave(retainSalesman: boolean): boolean {
  return !retainSalesman;
}

/**
 * Commission is recorded once per new bill when a salesman is selected.
 * Retaining the name across bills must not bypass the !currentSaleId guard —
 * editing an existing sale never auto-creates commission again.
 */
export function shouldCreatePosCommissionOnSave(params: {
  salesmanName: string | null | undefined;
  /** True when saving an edit of an already-persisted sale (currentSaleId set). */
  isEditingExistingSale: boolean;
}): boolean {
  const name = String(params.salesmanName || "").trim();
  if (!name) return false;
  if (params.isEditingExistingSale) return false;
  return true;
}

export const POS_OPEN_SALESMAN_PICKER_EVENT = "ezzy-pos-open-salesman-picker";

export function dispatchPosOpenSalesmanPicker(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(POS_OPEN_SALESMAN_PICKER_EVENT));
}
