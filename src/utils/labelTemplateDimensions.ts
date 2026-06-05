/** Parse "50*38", "50x38", "50×38" from a template or preset name. */
export function parseLabelSizeFromTemplateName(
  name: string,
): { width?: number; height?: number } {
  const m = name.match(/(\d{2,3})\s*[x×*]\s*(\d{2,3})/i);
  if (!m) return {};
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return {};
  }
  return { width, height };
}

export function resolveTemplateLabelDimensions(
  template: { name: string; labelWidth?: number; labelHeight?: number },
): { width: number; height: number } | null {
  if (template.labelWidth && template.labelHeight) {
    return { width: template.labelWidth, height: template.labelHeight };
  }
  const parsed = parseLabelSizeFromTemplateName(template.name);
  if (parsed.width && parsed.height) {
    return { width: parsed.width, height: parsed.height };
  }
  return null;
}

/** Registry key for a 1-up thermal roll preset, e.g. 50×38 → thermal_50x38_1up */
export function thermal1UpSheetTypeKey(width: number, height: number): string {
  return `thermal_${width}x${height}_1up`;
}

export function sheetPresetDimensions(
  sheetPresets: Record<string, { width: string; height: string; cols?: number }>,
  sheetType: string,
): { width: number; height: number } | null {
  const preset = sheetPresets[sheetType];
  if (!preset) return null;
  const width = parseInt(preset.width, 10);
  const height = parseInt(preset.height, 10);
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

/**
 * Pick the standard-tab sheet type that matches template sticker size.
 * Returns a thermal_1up key when one exists, otherwise "custom" with 1×1 dims.
 */
export function resolveStandardSheetTypeForLabelDimensions(
  width: number,
  height: number,
  sheetPresets: Record<string, unknown>,
): { sheetType: string; custom?: { width: number; height: number; cols: number; rows: number; gap: number } } {
  const key = thermal1UpSheetTypeKey(width, height);
  if (sheetPresets[key]) {
    return { sheetType: key };
  }
  return {
    sheetType: "custom",
    custom: { width, height, cols: 1, rows: 1, gap: 0 },
  };
}
