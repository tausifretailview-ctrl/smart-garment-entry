/**
 * Barcode Printing label list: the product description shown per line, and how many lines
 * share each barcode (DUP badge). Counting once per list replaces a per-row scan of the whole
 * list (500 lines meant 250,000 comparisons on every redraw).
 */
export type LabelListDescriptionParts = {
  product_name: string;
  category?: string | null;
  style?: string | null;
  color?: string | null;
  brand?: string | null;
};

/** Name, then category, style, colour, brand when set (blank or "-" left out), joined with "-". */
export function labelListDescription(item: LabelListDescriptionParts): string {
  const parts = [item.product_name];
  for (const part of [item.category, item.style, item.color, item.brand]) {
    const t = part?.trim();
    if (t && t !== "-") parts.push(part as string);
  }
  return parts.join("-");
}

/** How many lines carry each barcode (lines without a barcode are not counted). */
export function barcodeLineCounts(items: Array<{ barcode?: string | null }>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item.barcode) continue;
    counts.set(item.barcode, (counts.get(item.barcode) ?? 0) + 1);
  }
  return counts;
}
