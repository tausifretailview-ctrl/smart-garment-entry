/**
 * Price printed on the footwear `mrp` label field.
 * Same rule as `effectiveBarcodePriceTier`: MRP when > 0, otherwise sale price.
 * Kept here so TSPL generation does not import `barcodeValidation` (supabase).
 */
export function labelPrintMrp(
  mrp?: number | null,
  salePrice?: number | null,
): number {
  const m = Number(mrp) || 0;
  const s = Number(salePrice) || 0;
  return m > 0 ? m : s;
}
