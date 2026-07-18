export interface BrandDiscountRow {
  brand: string;
  discount_percent: number;
}

/** Normalize brand strings before comparing: trim, collapse whitespace, lowercase. */
export function normalizeBrand(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Exact brand row lookup. Returns null when no row exists so callers can
 * distinguish "configured at 0%" from "not configured".
 */
export function findExactBrandDiscount(
  brandDiscounts: BrandDiscountRow[],
  brand: string | null | undefined,
): number | null {
  const target = normalizeBrand(brand);
  if (!target) return null;
  const row = brandDiscounts.find((bd) => normalizeBrand(bd.brand) === target);
  if (!row) return null;
  const pct = Number(row.discount_percent);
  return Number.isFinite(pct) ? pct : 0;
}

/** Minimum product-name token length for brand fallback (avoids matching "A"). */
export const BRAND_DISCOUNT_MIN_TOKEN_LENGTH = 2;

/**
 * Resolve customer brand discount for a product.
 * - Exact product.brand match wins, including intentional 0%.
 * - Only when the brand has no row, fall back to product-name tokens
 *   (e.g. PUG-RLX-KIDS → RLX). Short tokens are skipped.
 */
export function resolveBrandDiscountForProduct(
  brandDiscounts: BrandDiscountRow[],
  brand: string | null | undefined,
  productName?: string | null,
): number {
  const direct = findExactBrandDiscount(brandDiscounts, brand);
  if (direct !== null) return direct;

  if (!productName || brandDiscounts.length === 0) return 0;

  const segments = productName
    .split(/[-/\s|]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= BRAND_DISCOUNT_MIN_TOKEN_LENGTH);

  for (const segment of segments) {
    const match = findExactBrandDiscount(brandDiscounts, segment);
    // Token hit including 0% stops further fallback (do not pick a later 7%).
    if (match !== null) return match;
  }
  return 0;
}
