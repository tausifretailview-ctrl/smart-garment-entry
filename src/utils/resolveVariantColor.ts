/**
 * Effective display color for a size/barcode row.
 * Prefer `product_variants.color`; fall back to `products.color` for legacy rows
 * where colour was only stored on the product master.
 */
export function resolveVariantColor(
  variantColor?: string | null,
  productColor?: string | null,
): string {
  const fromVariant = String(variantColor ?? "").trim();
  if (fromVariant) return fromVariant;
  return String(productColor ?? "").trim();
}
