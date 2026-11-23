/**
 * Rules for the Standard tab's saved default on Barcode Printing, kept apart for unit tests.
 * "Save Default" stores the label template together with the sheet type, so both have to match
 * before the button may read "Default ✓".
 */

export type SavedStandardDefault = {
  defaultTemplate?: string | null;
  sheetType?: string;
  customPresetName?: string;
};

export type CurrentStandardSelection = {
  template: string | null;
  sheetType: string;
  /** Name of the shop's own saved sheet (Sheet Type → "My sheets"); null when none is picked. */
  customPresetName: string | null;
};

/**
 * True when what is on screen is exactly what "Save Default" last stored.
 * The template alone is not enough: a shop that picks another sheet type saw "Default ✓",
 * took it as saved, and had to pick the sheet again on every visit.
 */
export function standardDefaultIsCurrent(
  saved: SavedStandardDefault | null | undefined,
  current: CurrentStandardSelection,
): boolean {
  if (!saved || !current.template) return false;
  if ((saved.defaultTemplate || null) !== current.template) return false;
  if ((saved.sheetType || "") !== current.sheetType) return false;
  if (current.sheetType !== "custom") return true;
  return (saved.customPresetName || "") === (current.customPresetName || "");
}

/**
 * True when the shop's own saved sheet is selected and its sticker is the size a label design
 * was made for (within 0.5 mm). Loading such a design must leave the sheet alone: swapping it
 * for a built-in sheet of the same size drops the shop's columns, rows and gaps.
 */
export function namedSheetFitsLabel(
  sheet: { sheetType: string; selectedPreset: string; customWidth: number; customHeight: number },
  labelWidth: number,
  labelHeight: number,
): boolean {
  if (sheet.sheetType !== "custom" || !sheet.selectedPreset) return false;
  return Math.abs(sheet.customWidth - labelWidth) < 0.5 && Math.abs(sheet.customHeight - labelHeight) < 0.5;
}
