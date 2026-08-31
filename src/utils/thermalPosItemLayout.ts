/**
 * Shared 80mm POS thermal item-row layout.
 * One product line: name + medium BC on the left, QTY / RATE / AMT on the right.
 * Amount column is sized for Indian grouping (e.g. 16,980 / 2,19,400) so totals are not clipped.
 */

export const THERMAL_POS_ITEM_COLUMNS = "minmax(0,1fr) 6mm 14mm 18mm";

export const THERMAL_POS_BC_FONT_SIZE = "10px";
export const THERMAL_POS_BC_FONT_WEIGHT = 500;

export function formatThermalPosAmount(n: number): string {
  const value = Number.isFinite(n) ? n : 0;
  return Math.round(value).toLocaleString("en-IN");
}
