/** Raw variant row from product_variants query */
export type SizeGridVariantSource = {
  id: string;
  size: string | null;
  color: string | null;
  barcode?: string | null;
  sale_price?: number | null;
  mrp?: number | null;
  stock_qty?: number | null;
  pur_price?: number | null;
  product_id?: string;
};

export type MergedSizeGridVariant = {
  id: string;
  size: string;
  color: string;
  barcode?: string | null;
  sale_price: number;
  mrp: number;
  stock_qty: number;
  pur_price?: number;
};

function sizeColorKey(
  size: string | null | undefined,
  color: string | null | undefined,
): string {
  return `${(size || "").toLowerCase()}_${(color || "").toLowerCase()}`;
}

function pickRepresentativeVariant<T extends SizeGridVariantSource>(
  variants: T[],
  selectedSalePrice?: number,
): T {
  let best = variants[0];
  for (let i = 1; i < variants.length; i++) {
    const v = variants[i];
    const existingStock = best.stock_qty || 0;
    const newStock = v.stock_qty || 0;

    if (selectedSalePrice != null) {
      const existingMatchesPrice =
        Math.round(best.sale_price || 0) === Math.round(selectedSalePrice);
      const newMatchesPrice =
        Math.round(v.sale_price || 0) === Math.round(selectedSalePrice);

      if (newMatchesPrice && !existingMatchesPrice) {
        best = v;
      } else if (newMatchesPrice === existingMatchesPrice && newStock > existingStock) {
        best = v;
      }
    } else if (newStock > existingStock) {
      best = v;
    }
  }
  return best;
}

/**
 * Merge duplicate size+color variants for size-grid display.
 * Sums stock across all matching rows (Size Stock report parity); keeps one
 * representative variant for id/pricing (prefers selected sale price, then highest stock).
 */
export function mergeSizeColorVariantsForGrid<T extends SizeGridVariantSource>(
  variants: T[],
  options?: {
    selectedSalePrice?: number;
    cartQtyByVariant?: Map<string, number>;
    defaultColor?: string;
  },
): MergedSizeGridVariant[] {
  const groups = new Map<string, T[]>();
  for (const v of variants) {
    const key = sizeColorKey(v.size, v.color);
    const list = groups.get(key) || [];
    list.push(v);
    groups.set(key, list);
  }

  const { selectedSalePrice, cartQtyByVariant, defaultColor = "" } = options ?? {};

  return Array.from(groups.values()).map((group) => {
    const rep = pickRepresentativeVariant(group, selectedSalePrice);
    const totalStock = group.reduce((sum, v) => sum + (v.stock_qty || 0), 0);
    const cartReserved = group.reduce(
      (sum, v) => sum + (cartQtyByVariant?.get(v.id) || 0),
      0,
    );
    return {
      id: rep.id,
      size: rep.size || "",
      color: rep.color || defaultColor,
      barcode: rep.barcode,
      sale_price: rep.sale_price || 0,
      mrp: rep.mrp || 0,
      pur_price: rep.pur_price ?? undefined,
      stock_qty: Math.max(0, totalStock - cartReserved),
    };
  });
}
