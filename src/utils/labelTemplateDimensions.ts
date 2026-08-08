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

type SheetPresetEntry = {
  width?: string;
  height?: string;
  cols?: number;
  rows?: number;
  gap?: string;
  category?: string;
  thermal?: boolean;
};

/**
 * Prefer canonical A4 sheet keys when several aliases share the same die-cut
 * (e.g. 39×35 → a4_40sheet over novajet40 / a4_39x35_40sheet).
 */
const A4_SHEET_TYPE_PREFERENCE: string[] = [
  "a4_40sheet",
  "novajet40",
  "a4_39x35_40sheet",
  "a4_12x4",
  "a4_35x37",
  "novajet48",
  "novajet65",
  "a4_65sheet",
  "a4_80sheet",
  "a4_36sheet",
  "a4_32sheet",
  "a4_35square",
  "a4_24sheet",
  "a4_21sheet",
  "a4_20sheet",
];

function parsePresetMm(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(String(value).replace(/mm$/i, "").trim());
  return Number.isFinite(n) ? n : null;
}

function isA4MultiLabelPreset(key: string, preset: SheetPresetEntry): boolean {
  if (key === "custom") return false;
  if (preset.thermal || preset.category === "thermal") return false;
  if (preset.category === "a4") return true;
  // A4 sheets always define a multi-label grid.
  return (preset.cols ?? 0) >= 2 && (preset.rows ?? 0) >= 2;
}

/**
 * Match an A4 sheet preset by label W×H (and optional cols×rows).
 * Returns null when no A4 multi-label preset fits.
 */
export function findMatchingA4SheetType(
  width: number,
  height: number,
  sheetPresets: Record<string, unknown>,
  opts?: { cols?: number; rows?: number },
): string | null {
  const matches: string[] = [];
  for (const [key, raw] of Object.entries(sheetPresets)) {
    const preset = raw as SheetPresetEntry;
    if (!isA4MultiLabelPreset(key, preset)) continue;
    const pw = parsePresetMm(preset.width);
    const ph = parsePresetMm(preset.height);
    if (pw == null || ph == null) continue;
    if (Math.abs(pw - width) >= 0.5 || Math.abs(ph - height) >= 0.5) continue;
    if (
      opts?.cols != null &&
      opts.cols > 0 &&
      preset.cols != null &&
      preset.cols !== opts.cols
    ) {
      continue;
    }
    if (
      opts?.rows != null &&
      opts.rows > 0 &&
      preset.rows != null &&
      preset.rows !== opts.rows
    ) {
      continue;
    }
    matches.push(key);
  }
  if (matches.length === 0) return null;

  matches.sort((a, b) => {
    const ia = A4_SHEET_TYPE_PREFERENCE.indexOf(a);
    const ib = A4_SHEET_TYPE_PREFERENCE.indexOf(b);
    const ra = ia === -1 ? 999 : ia;
    const rb = ib === -1 ? 999 : ib;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
  return matches[0];
}

/**
 * Pick the standard-tab sheet type that matches template sticker size.
 * Prefers thermal 1-up, then A4 multi-label by W×H (e.g. 39×35 → a4_40sheet),
 * otherwise "custom" (1×1, or the provided A4 grid when cols/rows are known).
 */
export function resolveStandardSheetTypeForLabelDimensions(
  width: number,
  height: number,
  sheetPresets: Record<string, unknown>,
  opts?: { cols?: number; rows?: number; gap?: number },
): {
  sheetType: string;
  custom?: { width: number; height: number; cols: number; rows: number; gap: number };
} {
  const thermalKey = thermal1UpSheetTypeKey(width, height);
  if (sheetPresets[thermalKey]) {
    return { sheetType: thermalKey };
  }

  const a4Key = findMatchingA4SheetType(width, height, sheetPresets, opts);
  if (a4Key) {
    return { sheetType: a4Key };
  }

  const cols = opts?.cols && opts.cols > 0 ? opts.cols : 1;
  const rows = opts?.rows && opts.rows > 0 ? opts.rows : 1;
  const gap = opts?.gap ?? 0;
  return {
    sheetType: "custom",
    custom: { width, height, cols, rows, gap },
  };
}
