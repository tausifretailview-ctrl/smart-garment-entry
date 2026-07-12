export type PrecisionPrintMode = "thermal" | "thermal2up" | "thermal3up" | "a4";

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

export function inferPrecisionPrintMode(preset: PrecisionPresetModeHint): PrecisionPrintMode {
  if (
    preset.printMode === "thermal2up" ||
    preset.printMode === "thermal3up" ||
    preset.printMode === "a4"
  ) {
    return preset.printMode;
  }
  if (preset.a4Cols && preset.a4Rows) return "a4";
  if (preset.name) {
    const fromName = inferPrintModeFromName(preset.name);
    if (fromName === "thermal3up" || fromName === "thermal2up") return fromName;
  }
  if (preset.printMode === "thermal") return "thermal";
  if (preset.name) {
    const fromName = inferPrintModeFromName(preset.name);
    if (fromName) return fromName;
  }
  return thermalColsToPrintMode(preset.thermalCols || 1);
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
  return "1-Up";
}

/** Full print-mode label for UI buttons and hints. */
export function getPrecisionPrintModeDisplayName(mode: PrecisionPrintMode): string {
  if (mode === "thermal3up") return "Thermal (3-Up)";
  if (mode === "thermal2up") return "Thermal (2-Up)";
  if (mode === "a4") return "A4 Sheet";
  return "Thermal (1-Up)";
}

export function resolvePresetPrintMode(preset: PrecisionPresetModeHint): PrecisionPrintMode {
  if (
    preset.printMode === "thermal" ||
    preset.printMode === "thermal2up" ||
    preset.printMode === "thermal3up" ||
    preset.printMode === "a4"
  ) {
    return preset.printMode;
  }
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
