export type PrecisionPrintMode =
  | "thermal"
  | "thermal2up"
  | "thermal3up"
  | "a4"
  | "footwear";

export type PrecisionPresetModeHint = {
  name?: string;
  printMode?: string;
  a4Cols?: number;
  a4Rows?: number;
  thermalCols?: number;
};

/** Infer multi-up mode from preset name when DB print_mode is missing or stale. */
export function inferPrintModeFromName(name: string): PrecisionPrintMode | null {
  const n = name.toLowerCase();
  if (
    n.includes("footwear") ||
    n.includes("box+pair") ||
    n.includes("box + pair") ||
    n.includes("precision pro tsc")
  ) {
    return "footwear";
  }
  if (/\b3\s*[-*]?\s*up\b/.test(n) || n.includes("3up") || n.includes("3-up")) {
    return "thermal3up";
  }
  if (/\b2\s*[-*]?\s*up\b/.test(n) || n.includes("2up") || n.includes("2-up")) {
    return "thermal2up";
  }
  if (/\b1\s*[-*]?\s*up\b/.test(n) || n.includes("1up") || n.includes("1-up")) {
    return "thermal";
  }
  return null;
}

export function isPrecisionThermalSheetMode(mode: string): boolean {
  return mode === "thermal" || mode === "thermal2up" || mode === "thermal3up";
}

export function isPrecisionFootwearMode(mode: string): boolean {
  return mode === "footwear";
}

export function isPrecisionThermalMultiUp(mode: string): boolean {
  return mode === "thermal2up" || mode === "thermal3up";
}

export function printModeToThermalCols(mode: string): number {
  if (mode === "thermal3up") return 3;
  if (mode === "thermal2up") return 2;
  return 1;
}

export function thermalColsToPrintMode(cols: number): PrecisionPrintMode {
  if (cols >= 3) return "thermal3up";
  if (cols === 2) return "thermal2up";
  return "thermal";
}

export function getPrecisionThermalCols(mode: string, thermalCols = 1): number {
  const fromMode = printModeToThermalCols(mode);
  if (fromMode > 1) return Math.max(fromMode, thermalCols);
  return 1;
}

const EXPLICIT_PRINT_MODES: PrecisionPrintMode[] = [
  "thermal",
  "thermal2up",
  "thermal3up",
  "a4",
  "footwear",
];

function isExplicitPrintMode(mode: string | undefined): mode is PrecisionPrintMode {
  return EXPLICIT_PRINT_MODES.includes(mode as PrecisionPrintMode);
}

export function inferPrecisionPrintMode(preset: PrecisionPresetModeHint): PrecisionPrintMode {
  const fromName = preset.name ? inferPrintModeFromName(preset.name) : null;
  const fromCols =
    (preset.thermalCols || 0) >= 2 ? thermalColsToPrintMode(preset.thermalCols as number) : null;

  // "thermal" was the only thermal value for years. A leftover print_mode=thermal
  // must not hide 2-up / 3-up evidence from the name or thermal_cols.
  // Leftover a4_cols/a4_rows on a thermal preset still must not win.
  if (preset.printMode === "thermal") {
    if (fromName === "thermal2up" || fromName === "thermal3up" || fromName === "footwear") {
      return fromName;
    }
    if (fromCols) return fromCols;
    return "thermal";
  }

  if (isExplicitPrintMode(preset.printMode)) {
    return preset.printMode;
  }
  if (fromName) return fromName;
  // Only treat as A4 when mode is unknown and sheet grid dims are present
  if (preset.a4Cols && preset.a4Rows) return "a4";
  return fromCols ?? thermalColsToPrintMode(preset.thermalCols || 1);
}

/** Apply purchase-dashboard landing once per navigation — later preset refreshes must not steal 3-up. */
export function shouldApplyPurchaseLanding(
  appliedKey: string | null,
  purchaseNavKey: string | null,
): boolean {
  return Boolean(purchaseNavKey) && appliedKey !== purchaseNavKey;
}

export function presetMatchesPrintMode(
  preset: PrecisionPresetModeHint,
  mode: PrecisionPrintMode,
): boolean {
  return inferPrecisionPrintMode(preset) === mode;
}

export function getPrecisionThermalModeLabel(mode: string): string {
  if (mode === "thermal3up") return "3-Up";
  if (mode === "thermal2up") return "2-Up";
  if (mode === "a4") return "A4";
  if (mode === "footwear") return "Footwear";
  return "1-Up";
}

/** Full print-mode label for UI buttons and hints. */
export function getPrecisionPrintModeDisplayName(mode: PrecisionPrintMode): string {
  if (mode === "thermal3up") return "Thermal (3-Up)";
  if (mode === "thermal2up") return "Thermal (2-Up)";
  if (mode === "a4") return "A4 Sheet";
  if (mode === "footwear") return "Footwear Box+Pair";
  return "Thermal (1-Up)";
}

export function resolvePresetPrintMode(preset: PrecisionPresetModeHint): PrecisionPrintMode {
  return inferPrecisionPrintMode(preset);
}

export function findDefaultPresetForMode<T extends PrecisionPresetModeHint & { isDefault?: boolean }>(
  presets: T[],
  mode: PrecisionPrintMode,
): T | undefined {
  return presets.find((p) => p.isDefault && presetMatchesPrintMode(p, mode));
}

export function getThermalPreviewCols(mode: string): number {
  return getPrecisionThermalCols(mode);
}

/** Total physical strip width for multi-column thermal rows (mm). */
export function computeMultiUpStripWidthMm(
  singleLabelWidthMm: number,
  cols: number,
  hGap: number,
): number {
  const c = Math.max(1, cols);
  const gap = Math.max(0, hGap);
  return singleLabelWidthMm * c + gap * Math.max(0, c - 1);
}
