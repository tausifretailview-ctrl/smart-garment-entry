export type PrecisionPrintMode = "thermal" | "thermal2up" | "thermal3up" | "a4";

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

export function inferPrecisionPrintMode(preset: {
  printMode?: string;
  a4Cols?: number;
  a4Rows?: number;
  thermalCols?: number;
}): PrecisionPrintMode {
  if (preset.printMode === "thermal" || preset.printMode === "thermal2up" || preset.printMode === "thermal3up" || preset.printMode === "a4") {
    return preset.printMode;
  }
  if (preset.a4Cols && preset.a4Rows) return "a4";
  return thermalColsToPrintMode(preset.thermalCols || 1);
}

export function getPrecisionThermalModeLabel(mode: string): string {
  if (mode === "thermal3up") return "3-Up";
  if (mode === "thermal2up") return "2-Up";
  if (mode === "a4") return "A4";
  return "1-Up";
}

export function getThermalPreviewCols(mode: string): number {
  return getPrecisionThermalCols(mode);
}
