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
 * Center a label grid on A4, then apply user nudges (positive top = move down, positive left = move right).
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
  const baseTop = Math.max(0, (A4_PAGE_HEIGHT_MM - contentH) / 2);
  const baseLeft = Math.max(0, (A4_PAGE_WIDTH_MM - contentW) / 2);
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

/** Standard A4 die-cut sheet: 48 labels, 48×24mm, 4×12, no inter-label gap. */
export const A4_48_LABEL_48X24 = {
  cols: 4,
  rows: 12,
  labelWidthMm: 48,
  labelHeightMm: 24,
  gapMm: 0,
  defaultOffsets: { top: 0, left: 0, bottom: 0, right: 0 } as A4SheetMarginOffsets,
} as const;
