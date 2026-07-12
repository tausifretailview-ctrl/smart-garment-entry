import type { LabelDesignConfig } from "@/types/labelTypes";
import type { PrecisionPrintMode } from "@/utils/precisionThermalModes";

export type PrecisionDesignBaseline = {
  presetName: string | null;
  xOffset: number;
  yOffset: number;
  vGap: number;
  hGap: number;
  labelWidth: number;
  labelHeight: number;
  a4Cols: number;
  a4Rows: number;
  thermalCols: number;
  printMode: PrecisionPrintMode;
  labelConfigJson: string;
};

type PrecisionSettingsSlice = {
  xOffset: number;
  yOffset: number;
  vGap: number;
  hGap: number;
  labelWidth: number;
  labelHeight: number;
  a4Cols: number;
  a4Rows: number;
  thermalCols: number;
  printMode: PrecisionPrintMode;
  labelConfig: LabelDesignConfig | null;
};

export function snapshotPrecisionDesign(
  settings: PrecisionSettingsSlice,
  presetName: string | null,
): PrecisionDesignBaseline {
  return {
    presetName,
    xOffset: settings.xOffset,
    yOffset: settings.yOffset,
    vGap: settings.vGap,
    hGap: settings.hGap,
    labelWidth: settings.labelWidth,
    labelHeight: settings.labelHeight,
    a4Cols: settings.a4Cols,
    a4Rows: settings.a4Rows,
    thermalCols: settings.thermalCols,
    printMode: settings.printMode,
    labelConfigJson: JSON.stringify(settings.labelConfig ?? null),
  };
}

export function precisionDesignHasUnsavedChanges(
  baseline: PrecisionDesignBaseline | null,
  settings: PrecisionSettingsSlice,
  presetName: string | null,
): boolean {
  if (!baseline?.presetName || !presetName) return false;
  if (baseline.presetName !== presetName) return true;

  const current = snapshotPrecisionDesign(settings, presetName);
  return (
    current.xOffset !== baseline.xOffset ||
    current.yOffset !== baseline.yOffset ||
    current.vGap !== baseline.vGap ||
    current.hGap !== baseline.hGap ||
    current.labelWidth !== baseline.labelWidth ||
    current.labelHeight !== baseline.labelHeight ||
    current.a4Cols !== baseline.a4Cols ||
    current.a4Rows !== baseline.a4Rows ||
    current.thermalCols !== baseline.thermalCols ||
    current.printMode !== baseline.printMode ||
    current.labelConfigJson !== baseline.labelConfigJson
  );
}
