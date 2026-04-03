/**
 * Unified product search utility.
 * All search bars across the app MUST use these fields and logic
 * to ensure consistent results everywhere.
 */

/** Canonical list of fields every product search should cover */
export const PRODUCT_SEARCH_FIELDS = [
  'product_name',
  'style',
  'brand',
  'category',
  'color',
  'barcode',
  'hsn_code',
  'size',
] as const;

/**
 * Client-side multi-token AND filter.
 * Splits query into tokens; a row matches only if EVERY token
 * appears somewhere across all searchable fields.
 */
export function filterProductMatch(
  query: string,
  row: Record<string, any>,
): boolean {
  if (!query || !query.trim()) return true;
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = PRODUCT_SEARCH_FIELDS
    .map(f => (row[f] != null ? String(row[f]) : ''))
    .join(' ')
    .toLowerCase();
  return tokens.every(t => haystack.includes(t));
}

/**
 * Build a Supabase `.or()` filter string covering all product-level
 * text columns for a single search token.
 * Use on the `products` table (not variants).
 */
export function buildProductOrFilter(token: string): string {
  return [
    `product_name.ilike.%${token}%`,
    `brand.ilike.%${token}%`,
    `style.ilike.%${token}%`,
    `category.ilike.%${token}%`,
    `color.ilike.%${token}%`,
    `hsn_code.ilike.%${token}%`,
  ].join(',');
}

/**
 * Build a Supabase `.or()` filter string for variant-level search.
 * Covers barcode, size, color on product_variants table.
 */
export function buildVariantOrFilter(token: string): string {
  return [
    `barcode.ilike.%${token}%`,
    `size.ilike.%${token}%`,
    `color.ilike.%${token}%`,
  ].join(',');
}
