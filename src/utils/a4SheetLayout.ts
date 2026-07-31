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

export function isNovaJetMpl48LLayout(
  cols: number,
  rows: number,
  labelWidthMm: number,
  labelHeightMm: number,
  gapMm: number,
): boolean {
  return (
    cols === A4_48_LABEL_48X24.cols &&
    rows === A4_48_LABEL_48X24.rows &&
    Math.abs(labelWidthMm - A4_48_LABEL_48X24.labelWidthMm) < 0.05 &&
    Math.abs(labelHeightMm - A4_48_LABEL_48X24.labelHeightMm) < 0.05 &&
    Math.abs(gapMm - A4_48_LABEL_48X24.gapMm) < 0.05
  );
}

/**
 * Center a label grid on A4, then apply user nudges (positive top = move down, positive left = move right).
 * NovaJet MPL 48L uses the manufacturer top/left margins instead of vertical centering —
 * centering left the first rows printing above the die-cut.
 */
export function computeA4SheetMargins(
  cols: number,
  rows: number,
  labelWidthMm: number,
  labelHeightMm: number,
  gapMm: number,
  offsets: A4SheetMarginOffsets = {},
): { marginTop: number; marginLeft: number; marginBottom: number; marginRight: number } {
  const contentW = cols * labelWidthMm + Math.max(0, cols - 1) * gapMm;
  const contentH = rows * labelHeightMm + Math.max(0, rows - 1) * gapMm;

  const novaJet48L = isNovaJetMpl48LLayout(cols, rows, labelWidthMm, labelHeightMm, gapMm);
  const baseTop = novaJet48L
    ? A4_48_LABEL_48X24.sheetTopMarginMm
    : Math.max(0, (A4_PAGE_HEIGHT_MM - contentH) / 2);
  const baseLeft = novaJet48L
    ? A4_48_LABEL_48X24.sheetLeftMarginMm
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
