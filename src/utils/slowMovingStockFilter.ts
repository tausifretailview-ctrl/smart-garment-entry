/**
 * Client-side product filter for Dead / Slow Moving rows
 * (name, barcode, brand, category).
 */

export type SlowMovingFilterableRow = {
  product_name?: string | null;
  barcode?: string | null;
  brand?: string | null;
  category?: string | null;
};

export function matchesSlowMovingProductFilter(
  row: SlowMovingFilterableRow,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [row.product_name, row.barcode, row.brand, row.category]
    .map((v) => (v ?? "").toLowerCase())
    .join(" ");
  return haystack.includes(q);
}

export function filterSlowMovingStockRows<T extends SlowMovingFilterableRow>(
  rows: T[],
  query: string,
): T[] {
  if (!query.trim()) return rows;
  return rows.filter((row) => matchesSlowMovingProductFilter(row, query));
}
