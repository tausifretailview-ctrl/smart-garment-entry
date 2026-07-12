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
  return precisionLabelDesignHasUnsavedChanges(
    baseline,
    settings.labelConfig,
    presetName,
  );
}

/** True only when Label Designer field layout changed vs last saved/loaded snapshot. */
export function precisionLabelDesignHasUnsavedChanges(
  baseline: PrecisionDesignBaseline | null,
  labelConfig: LabelDesignConfig | null,
  presetName: string | null,
): boolean {
  if (!baseline?.presetName || !presetName) return false;
  if (baseline.presetName !== presetName) return false;
  const currentJson = JSON.stringify(labelConfig ?? null);
  return currentJson !== baseline.labelConfigJson;
}

export function syncBaselineLabelConfig(
  baseline: PrecisionDesignBaseline | null,
  presetName: string | null,
  labelConfig: LabelDesignConfig | null,
): PrecisionDesignBaseline | null {
  if (!presetName) return baseline;
  const labelConfigJson = JSON.stringify(labelConfig ?? null);
  if (!baseline) {
    return {
      presetName,
      xOffset: 0,
      yOffset: 0,
      vGap: 0,
      hGap: 0,
      labelWidth: 0,
      labelHeight: 0,
      a4Cols: 4,
      a4Rows: 12,
      thermalCols: 1,
      printMode: "thermal",
      labelConfigJson,
    };
  }
  return { ...baseline, presetName, labelConfigJson };
}
