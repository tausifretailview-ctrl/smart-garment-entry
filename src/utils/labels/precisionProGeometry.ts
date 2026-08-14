/**
 * Shared geometry for Precision Pro TSC footwear form (102×53mm @ 203 DPI).
 * Single source of truth for TSPL generator and on-screen preview — do not
 * redeclare these coordinates elsewhere.
 *
 * Die-cut: box 64×53mm | pair column 38×53mm (two 38×25mm stickers, 1.5mm
 * spare split top and bottom of the pair column).
 */

export const PRECISION_PRO_DPI = 203;
/** Dots per mm at 203 DPI. */
export const PRECISION_PRO_DOTS_PER_MM = 8;

export const PRECISION_PRO_TSC_WIDTH_MM = 102;
export const PRECISION_PRO_TSC_HEIGHT_MM = 53;
export const PRECISION_PRO_TSC_GAP_MM = 2;

export const LABEL_W = 816; // 102mm
export const LABEL_H = 424; // 53mm

export const BOX_W = 512; // 64mm (was 495 / 61.9mm)
/**
 * Pair column starts at the box right edge. 64mm + 38mm = 102mm exactly —
 * the physical die-cut is the seam (no printable gap inside the form).
 */
export const PAIR_X = 512;
export const PAIR_COL_W = 304; // 38mm

export const PAIR_TOP = 12; // 1.5mm — pair 1 content top
export const PAIR_H = 200; // 25mm
/** Pair 2 top — already correct at 26.5mm. */
export const PAIR_MID_Y = 212;

/** Left margin for box content (dots). */
export const BOX_CONTENT_X = 10;
/** Max barcode area width inside the box (dots), after left margin. */
export const BOX_BARCODE_MAX_W = BOX_W - BOX_CONTENT_X - 8;

/**
 * When true, TSPL/preview draw ink on the die-cut lines for debugging.
 * Default off — die-cut rolls must not print on the cut.
 */
export const PRECISION_PRO_DEBUG_DIVIDERS = false;

/** Truncation limits after reserving caption width on the box (~15–18mm). */
export const TRUNC = {
  box: {
    org: 18,
    product: 12,
    style: 14, // ART NO value after caption
    brand: 10,
    color: 12, // COLOUR value after caption
    category: 8,
    size: 4,
  },
  pair: {
    org: 12,
    product: 10,
    style: 14,
    brand: 8,
    color: 8,
    category: 6,
    size: 4,
  },
} as const;

/**
 * Approximate Code128 symbol width in dots (module count × narrow bar width).
 * Rule: if encoded width would exceed the box barcode max, the generator must
 * drop narrow-bar width from 2→1 (or refuse to use width 2).
 */
export function estimateCode128WidthDots(
  data: string,
  narrowBarWidth: number,
): number {
  const n = Math.max(0, (data || "").length);
  // Quiet zones (10+10) + start(11) + data(11n) + checksum(11) + stop(13)
  const modules = 10 + 10 + 11 + 11 * n + 11 + 13;
  return modules * Math.max(1, narrowBarWidth);
}

/** Narrow bar width (1 or 2) that fits inside the box barcode area. */
export function boxBarcodeNarrowBarWidth(barcode: string): 1 | 2 {
  if (estimateCode128WidthDots(barcode, 2) <= BOX_BARCODE_MAX_W) return 2;
  return 1;
}

/**
 * Size on the box uses font 5 at 2× (~64 dots/char) from x=320.
 * Available: BOX_W − 320 ≈ 192 dots → at most 2 characters at 2×.
 * Longer sizes drop to a smaller face so they stay inside the box.
 */
export function boxSizeOverflowSafe(size: string): {
  text: string;
  font: string;
  mulX: number;
  mulY: number;
  x: number;
  y: number;
} {
  const text = (size || "").slice(0, TRUNC.box.size);
  if (text.length <= 2) {
    return { text, font: "5", mulX: 2, mulY: 2, x: 320, y: 200 };
  }
  if (text.length === 3) {
    return { text, font: "5", mulX: 1, mulY: 1, x: 300, y: 210 };
  }
  return { text, font: "3", mulX: 1, mulY: 1, x: 260, y: 215 };
}

export function dotsToMm(dots: number): number {
  return dots / PRECISION_PRO_DOTS_PER_MM;
}

export function mmToDots(mm: number): number {
  return Math.round(mm * PRECISION_PRO_DOTS_PER_MM);
}
