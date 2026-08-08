/** ISO A4 page size (mm). */
export const A4_PAGE_WIDTH_MM = 210;
export const A4_PAGE_HEIGHT_MM = 297;

export type A4SheetMarginOffsets = {
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
};

/**
 * Explicit NovaJet die-cut brand — never inferred from label shape alone.
 * - mpl40 → Sheet Type `novajet40` (MPL 40L / 39×35, 5×8)
 * - mpl48 → Sheet Type `a4_12x4` (MPL 48L / 48×24, 4×12) — not `novajet48`
 *   (`novajet48` in BarcodePrinting is a different 8×6 × 33×19 sheet)
 */
export type NovaJetSheetBrand = "mpl40" | "mpl48";

/**
 * Map BarcodePrinting `sheetType` → NovaJet brand. Generic / custom sheets return null
 * even when their cols×rows×size happen to match a NovaJet die-cut.
 */
export function novaJetBrandFromSheetType(
  sheetType?: string | null,
): NovaJetSheetBrand | null {
  switch (String(sheetType || "").trim()) {
    case "novajet40":
      return "mpl40";
    case "a4_12x4":
      return "mpl48";
    default:
      return null;
  }
}

/**
 * TechNova NovaJet MPL 48L (NJMPL 48L / 48×24WR): 4×12 on A4, no inter-label gap.
 * Official die-cut top margin is 7.5mm (not vertically centered).
 */
export const A4_48_LABEL_48X24 = {
  cols: 4,
  rows: 12,
  labelWidthMm: 48,
  labelHeightMm: 24,
  gapMm: 0,
  /** Absolute top margin from sheet edge to first label row. */
  sheetTopMarginMm: 7.5,
  /** Absolute left margin: (210 − 4×48) / 2. */
  sheetLeftMarginMm: 9,
  defaultOffsets: { top: 0, left: 0, bottom: 0, right: 0 } as A4SheetMarginOffsets,
} as const;

/**
 * TechNova NovaJet MPL 40L (NJMPL 40L / 39×35 WR): 5×8 on A4, no inter-label gap.
 * Official label size is 39×35mm — not 38×35. A non-zero gap made row/column pitch
 * longer than the die-cut → top rows drift right and bottom rows drift left when
 * printers also apply Fit-to-page.
 */
export const A4_40_LABEL_39X35 = {
  cols: 5,
  rows: 8,
  labelWidthMm: 39,
  labelHeightMm: 35,
  gapMm: 0,
  /** (297 − 8×35) / 2 — vertically centered with zero gutter. */
  sheetTopMarginMm: 8.5,
  /** (210 − 5×39) / 2. */
  sheetLeftMarginMm: 7.5,
  defaultOffsets: { top: 0, left: 0, bottom: 0, right: 0 } as A4SheetMarginOffsets,
} as const;

/** True when the grid matches NovaJet MPL 48L sticker size (gap ignored). Shape-only helper. */
export function isNovaJetMpl48LGrid(
  cols: number,
  rows: number,
  labelWidthMm: number,
  labelHeightMm: number,
): boolean {
  return (
    cols === A4_48_LABEL_48X24.cols &&
    rows === A4_48_LABEL_48X24.rows &&
    Math.abs(labelWidthMm - A4_48_LABEL_48X24.labelWidthMm) < 0.05 &&
    Math.abs(labelHeightMm - A4_48_LABEL_48X24.labelHeightMm) < 0.05
  );
}

/**
 * True for NovaJet MPL 40L (39×35) and the common mistaken 38×35 / 40×35 presets —
 * both are 5×8 die-cut sheets. Shape-only helper — do not use alone to force layout.
 */
export function isNovaJetMpl40LGrid(
  cols: number,
  rows: number,
  labelWidthMm: number,
  labelHeightMm: number,
): boolean {
  if (cols !== A4_40_LABEL_39X35.cols || rows !== A4_40_LABEL_39X35.rows) return false;
  // Official 39×35, plus the 38×35 / 40×35 presets users saved by hand
  // (all describe the same 5×8 die-cut; only the pitch was wrong).
  if (Math.abs(labelHeightMm - A4_40_LABEL_39X35.labelHeightMm) > 1.05) return false;
  return labelWidthMm >= 37.95 && labelWidthMm <= 40.05;
}

/**
 * @deprecated Prefer {@link isNovaJetMpl48LGrid} + brand-gated {@link resolveA4LayoutGap}.
 * Kept for call sites that still pass gap; gap is ignored for the match.
 */
export function isNovaJetMpl48LLayout(
  cols: number,
  rows: number,
  labelWidthMm: number,
  labelHeightMm: number,
  _gapMm?: number,
): boolean {
  return isNovaJetMpl48LGrid(cols, rows, labelWidthMm, labelHeightMm);
}

function warnNovaJetShapeMismatch(
  brand: NovaJetSheetBrand,
  cols: number,
  rows: number,
  labelWidthMm: number,
  labelHeightMm: number,
): void {
  const shapeOk =
    brand === "mpl48"
      ? isNovaJetMpl48LGrid(cols, rows, labelWidthMm, labelHeightMm)
      : isNovaJetMpl40LGrid(cols, rows, labelWidthMm, labelHeightMm);
  if (shapeOk) return;
  console.warn(
    `[a4SheetLayout] sheetType is NovaJet ${brand} but dimensions ` +
      `${cols}×${rows} @ ${labelWidthMm}×${labelHeightMm}mm do not match the expected die-cut. ` +
      `Manufacturer overrides are still applied; check the saved preset.`,
  );
}

/**
 * NovaJet MPL 48L / 40L die-cuts have **zero** inter-label gap. Custom presets often
 * save Gap=1 by mistake; that disables manufacturer margins (contentH > A4) and
 * makes row pitch wrong → content drifts down the sheet.
 *
 * Overrides apply only when `novaJetBrand` is set from sheetType — never from shape alone.
 */
export function resolveA4LayoutGap(
  cols: number,
  rows: number,
  labelWidthMm: number,
  labelHeightMm: number,
  gapMm: number,
  novaJetBrand?: NovaJetSheetBrand | null,
): number {
  if (novaJetBrand === "mpl48") return A4_48_LABEL_48X24.gapMm;
  if (novaJetBrand === "mpl40") return A4_40_LABEL_39X35.gapMm;
  return gapMm;
}

/**
 * Coerce label width to official MPL 40L 39mm when sheetType is NovaJet 40L
 * (covers legacy 38/40mm presets saved under that sheet type).
 */
export function resolveA4LabelWidthMm(
  cols: number,
  rows: number,
  labelWidthMm: number,
  labelHeightMm: number,
  _gapMm?: number,
  novaJetBrand?: NovaJetSheetBrand | null,
): number {
  if (novaJetBrand === "mpl40") return A4_40_LABEL_39X35.labelWidthMm;
  return labelWidthMm;
}

/**
 * Center a label grid on A4, then apply user nudges (positive top = move down, positive left = move right).
 * NovaJet MPL 48L / 40L use manufacturer top/left margins instead of pure centering —
 * only when `novaJetBrand` is set from the selected sheetType.
 *
 * Sheet Margin UI fields are **nudges** on top of these bases (0 = manufacturer / centered).
 * Negative nudge is allowed (clamped so margins stay ≥ 0).
 */
export function computeA4SheetMargins(
  cols: number,
  rows: number,
  labelWidthMm: number,
  labelHeightMm: number,
  gapMm: number,
  offsets: A4SheetMarginOffsets = {},
  novaJetBrand?: NovaJetSheetBrand | null,
): { marginTop: number; marginLeft: number; marginBottom: number; marginRight: number } {
  const effectiveGap = resolveA4LayoutGap(
    cols,
    rows,
    labelWidthMm,
    labelHeightMm,
    gapMm,
    novaJetBrand,
  );
  const effectiveWidth = resolveA4LabelWidthMm(
    cols,
    rows,
    labelWidthMm,
    labelHeightMm,
    gapMm,
    novaJetBrand,
  );
  const contentW = cols * effectiveWidth + Math.max(0, cols - 1) * effectiveGap;
  const contentH = rows * labelHeightMm + Math.max(0, rows - 1) * effectiveGap;

  const novaJet48L = novaJetBrand === "mpl48";
  const novaJet40L = novaJetBrand === "mpl40";
  if (novaJet48L || novaJet40L) {
    warnNovaJetShapeMismatch(novaJetBrand!, cols, rows, labelWidthMm, labelHeightMm);
  }
  const baseTop = novaJet48L
    ? A4_48_LABEL_48X24.sheetTopMarginMm
    : novaJet40L
      ? A4_40_LABEL_39X35.sheetTopMarginMm
      : Math.max(0, (A4_PAGE_HEIGHT_MM - contentH) / 2);
  const baseLeft = novaJet48L
    ? A4_48_LABEL_48X24.sheetLeftMarginMm
    : novaJet40L
      ? A4_40_LABEL_39X35.sheetLeftMarginMm
      : Math.max(0, (A4_PAGE_WIDTH_MM - contentW) / 2);
  const baseBottom = Math.max(0, A4_PAGE_HEIGHT_MM - contentH - baseTop);
  const baseRight = Math.max(0, A4_PAGE_WIDTH_MM - contentW - baseLeft);

  const top = offsets.top ?? 0;
  const left = offsets.left ?? 0;
  const bottom = offsets.bottom ?? 0;
  const right = offsets.right ?? 0;

  return {
    marginTop: Math.max(0, baseTop + top),
    marginLeft: Math.max(0, baseLeft + left),
    marginBottom: Math.max(0, baseBottom - top + bottom),
    marginRight: Math.max(0, baseRight - left + right),
  };
}
