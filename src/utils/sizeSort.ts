/**
 * Standard garment size ordering used across the entire application.
 * Any size not in this list sorts to the end, then alphabetically.
 *
 * Note: 2XL and XXL are both common — keep 2XL immediately after XXL so
 * size-wise stock columns stay in sequence when products mix naming styles.
 */
export const SIZE_ORDER: string[] = [
  'XS', 'S', 'M', 'L', 'XL', 'XXL', '2XL', '3XL', '4XL', '5XL', '6XL',
  '26', '28', '30', '32', '34', '36', '38', '40', '42', '44',
  'Free',
];

/** Map alternate spellings to a canonical SIZE_ORDER token before index lookup. */
const SIZE_ALIASES: Record<string, string> = {
  '2XS': 'XS',
  'XXS': 'XS',
  '1XL': 'XL',
  'XXXL': '3XL',
  'XXXXL': '4XL',
  'XXXXXL': '5XL',
  'XXXXXXL': '6XL',
};

/** Returns the sort index for a size string (case-insensitive). */
const normalizeSize = (size: string): string => size.trim().toUpperCase();

const canonicalSize = (size: string): string => {
  const upper = normalizeSize(size);
  return SIZE_ALIASES[upper] ?? upper;
};

const isPureNumericSize = (size: string): boolean => /^\d+(\.\d+)?$/.test(normalizeSize(size));

const sizeIndex = (size: string): number => {
  const canonical = canonicalSize(size);
  const idx = SIZE_ORDER.findIndex((s) => normalizeSize(s) === canonical);
  return idx === -1 ? SIZE_ORDER.length + 1000 : idx;
};

/** Compare two size strings using the standard garment order. */
export const compareSizes = (a: string, b: string): number => {
  const normalizedA = normalizeSize(a);
  const normalizedB = normalizeSize(b);

  // If both are purely numeric sizes, always sort numerically in serial order.
  if (isPureNumericSize(normalizedA) && isPureNumericSize(normalizedB)) {
    return parseFloat(normalizedA) - parseFloat(normalizedB);
  }

  const ia = sizeIndex(normalizedA);
  const ib = sizeIndex(normalizedB);
  if (ia !== ib) return ia - ib;

  // For unknown mixed sizes, keep numeric-aware alphabetical fallback.
  return normalizedA.localeCompare(normalizedB, 'en', { numeric: true, sensitivity: 'base' });
};

/** Sort an array of size strings in-place (or return new array). */
export const sortSizes = (sizes: string[]): string[] =>
  [...sizes].sort(compareSizes);
