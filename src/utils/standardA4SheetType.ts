/** Sheet types that print on A4 label sheets (Standard Printing tab). */
const NON_A4_STANDARD_SHEET_TYPES = new Set([
  "precision_pro_tsc",
  "jewellery_100x15_1up",
]);

export type StandardA4CustomDimensions = {
  width?: number;
  height?: number;
  cols?: number;
  rows?: number;
  gap?: number;
};

/**
 * True when the saved Standard-tab sheet type is an A4 multi-label sheet
 * (laser / inkjet), not a thermal roll preset.
 */
export function isStandardA4SheetType(
  sheetType: unknown,
  customDimensions?: StandardA4CustomDimensions | null,
): boolean {
  if (typeof sheetType !== "string" || !sheetType) return false;
  if (NON_A4_STANDARD_SHEET_TYPES.has(sheetType)) return false;
  if (sheetType.startsWith("thermal_")) return false;

  if (sheetType.startsWith("a4_")) return true;
  if (sheetType.startsWith("novajet")) return true;

  if (sheetType === "custom") {
    const cols = Number(customDimensions?.cols ?? 0);
    const rows = Number(customDimensions?.rows ?? 0);
    if (cols <= 1 && rows <= 1) return false;

    const width = Number(customDimensions?.width ?? 0);
    if (width > 0 && cols > 0) {
      const gap = Number(customDimensions?.gap ?? 0);
      const totalWidth = width * cols + gap * Math.max(0, cols - 1);
      if (totalWidth >= 180 && totalWidth <= 230) return true;
    }

    return cols > 1 || rows > 1;
  }

  return false;
}
