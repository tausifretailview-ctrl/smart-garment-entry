/**
 * Standard garment size ordering used across the entire application.
 * Any size not in this list sorts to the end, then alphabetically.
 */
export const SIZE_ORDER: string[] = [
  'XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '4XL', '5XL', '6XL',
  '26', '28', '30', '32', '34', '36', '38', '40', '42', '44',
  'Free',
];

/** Returns the sort index for a size string (case-insensitive). */
const sizeIndex = (size: string): number => {
  const upper = size.trim().toUpperCase();
  const idx = SIZE_ORDER.findIndex(s => s.toUpperCase() === upper);
  return idx === -1 ? SIZE_ORDER.length + 1000 : idx;
};

/** Compare two size strings using the standard garment order. */
export const compareSizes = (a: string, b: string): number => {
  const ia = sizeIndex(a);
  const ib = sizeIndex(b);
  if (ia !== ib) return ia - ib;
  // Both unknown – try numeric then alpha
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (!isNaN(na) && !isNaN(nb)) return na - nb;
  return a.localeCompare(b);
};

/** Sort an array of size strings in-place (or return new array). */
export const sortSizes = (sizes: string[]): string[] =>
  [...sizes].sort(compareSizes);
