/**
 * Per-size stock for the Ella'Noor storefront.
 *
 * The public RPC already returns `variants[]` (size / color / stock_status / stock_left)
 * on every product, but the current storefront ignores them and only shows one
 * product-level badge. This module turns those variants into the size picker,
 * so what a customer can buy is exactly what the ERP says is on the rack.
 */

import type { PublicStorefrontProduct, PublicStorefrontVariant } from "@/lib/websiteTypes";

/** Public RPC hides exact on-hand qty above this; treat as "in stock" without a number. */
export const ELLA_HIDDEN_QTY_FLOOR = 6;
export const ELLA_LOW_STOCK_THRESHOLD = 3;

export const FREE_SIZE_LABEL = "FS";

export type EllaSizeOption = {
  variantId: string | null;
  /** Uppercased size label, "FS" when the product is free-size / unsized. */
  label: string;
  color: string | null;
  price: number | null;
  /** Units the ERP reports for this size. 0 = sold out. */
  available: number;
  /** False when the RPC withheld the exact number (i.e. plenty in stock). */
  availableKnown: boolean;
  inStock: boolean;
  low: boolean;
  /** Customer-facing line: "Only 2 left", "In stock · 4", "Sold out". */
  stockLabel: string;
};

const SIZE_ORDER = ["FS", "XXS", "XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL"];

export function normalizeSizeLabel(raw: string | null | undefined): string {
  const value = String(raw || "").trim().toUpperCase();
  if (!value) return FREE_SIZE_LABEL;
  if (/^(FREE|FREE SIZE|FREESIZE|ONE SIZE|OS)$/.test(value)) return FREE_SIZE_LABEL;
  return value.slice(0, 8);
}

export function ellaSizeSortKey(label: string): number {
  const index = SIZE_ORDER.indexOf(label);
  if (index >= 0) return index;
  const numeric = Number(label.replace(/[^0-9.]/g, ""));
  if (Number.isFinite(numeric) && numeric > 0) return 100 + numeric;
  return 900;
}

/** Units available for one variant, mirroring `availableFromPublicProduct` semantics. */
export function variantAvailability(variant: {
  stock_status?: string | null;
  stock_left?: number | null;
}): { available: number; availableKnown: boolean } {
  if (variant.stock_status === "out_of_stock") {
    return { available: 0, availableKnown: true };
  }
  if (variant.stock_left != null && Number.isFinite(Number(variant.stock_left))) {
    return { available: Math.max(0, Math.floor(Number(variant.stock_left))), availableKnown: true };
  }
  return { available: ELLA_HIDDEN_QTY_FLOOR, availableKnown: false };
}

export function sizeStockLabel(available: number, availableKnown: boolean): string {
  if (available <= 0) return "Sold out";
  if (available <= ELLA_LOW_STOCK_THRESHOLD) return `Only ${available} left`;
  if (!availableKnown) return "In stock";
  return `In stock · ${available}`;
}

function toSizeOption(variant: PublicStorefrontVariant): EllaSizeOption {
  const { available, availableKnown } = variantAvailability(variant);
  return {
    variantId: variant.id || null,
    label: normalizeSizeLabel(variant.size),
    color: (variant.color || "").trim() || null,
    price: variant.display_price != null && Number.isFinite(Number(variant.display_price))
      ? Number(variant.display_price)
      : null,
    available,
    availableKnown,
    inStock: available > 0,
    low: available > 0 && available <= ELLA_LOW_STOCK_THRESHOLD,
    stockLabel: sizeStockLabel(available, availableKnown),
  };
}

/**
 * Size options for a product. Variants sharing a size label are merged
 * (a size is buyable if any variant of that size has stock).
 */
export function toEllaSizeOptions(product: PublicStorefrontProduct): EllaSizeOption[] {
  const variants = Array.isArray(product.variants) ? product.variants : [];

  if (variants.length === 0) {
    // No variant rows — fall back to the product-level figure as a single free size.
    const { available, availableKnown } = variantAvailability(product);
    return [
      {
        variantId: null,
        label: FREE_SIZE_LABEL,
        color: null,
        price: product.display_price ?? null,
        available,
        availableKnown,
        inStock: available > 0,
        low: available > 0 && available <= ELLA_LOW_STOCK_THRESHOLD,
        stockLabel: sizeStockLabel(available, availableKnown),
      },
    ];
  }

  const merged = new Map<string, EllaSizeOption>();
  for (const variant of variants) {
    const option = toSizeOption(variant);
    const prev = merged.get(option.label);
    if (!prev) {
      merged.set(option.label, option);
      continue;
    }
    const available = prev.available + option.available;
    const availableKnown = prev.availableKnown && option.availableKnown;
    merged.set(option.label, {
      ...prev,
      // Keep the id of the variant that actually has stock, so the order line is exact.
      variantId: prev.inStock ? prev.variantId : option.variantId,
      price: prev.price ?? option.price,
      available,
      availableKnown,
      inStock: available > 0,
      low: available > 0 && available <= ELLA_LOW_STOCK_THRESHOLD,
      stockLabel: sizeStockLabel(available, availableKnown),
    });
  }

  return [...merged.values()].sort((a, b) => ellaSizeSortKey(a.label) - ellaSizeSortKey(b.label));
}

export function totalAvailableFromSizes(sizes: EllaSizeOption[]): number {
  return sizes.reduce((sum, s) => sum + s.available, 0);
}

export function anySizeKnown(sizes: EllaSizeOption[]): boolean {
  return sizes.some((s) => s.availableKnown);
}

/** First size with stock, else the first size (so the picker is never empty). */
export function pickDefaultSize(sizes: EllaSizeOption[]): EllaSizeOption | null {
  return sizes.find((s) => s.inStock) || sizes[0] || null;
}

export function findSize(sizes: EllaSizeOption[], label: string | null): EllaSizeOption | null {
  if (!label) return null;
  return sizes.find((s) => s.label === label) || null;
}

/** Every distinct size across the catalogue — drives the collection size filter. */
export function catalogueSizeFacets(
  products: Array<{ sizes: EllaSizeOption[] }>,
): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>();
  for (const product of products) {
    for (const size of product.sizes) {
      if (!size.inStock) continue;
      counts.set(size.label, (counts.get(size.label) || 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => ellaSizeSortKey(a.label) - ellaSizeSortKey(b.label));
}
