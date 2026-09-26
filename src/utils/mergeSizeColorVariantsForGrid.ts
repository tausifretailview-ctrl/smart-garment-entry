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
  product_id?: string;
  product_name?: string;
  size: string;
  color: string;
  barcode?: string | null;
  sale_price: number;
  mrp: number;
  stock_qty: number;
  pur_price?: number;
};

/** Product master fields needed to colour variants that come from several products. */
export type SizeGridProductInfo = {
  id: string;
  product_name?: string | null;
  color?: string | null;
};

/**
 * Colour to show for each product's variants when one size grid holds several
 * products (e.g. "0667109 WOMENS CML" + "0667109 WOMENS KHK" grouped by the
 * search). Uses products.color; when that is blank and the group has more than
 * one product, falls back to the part of the product name that differs
 * ("CML" / "KHK") so each product still gets its own colour row.
 */
export function buildSizeGridColorByProduct(
  products: SizeGridProductInfo[],
): Map<string, string> {
  const result = new Map<string, string>();
  const names = products.map((p) => String(p.product_name ?? "").trim());
  let prefixLen = 0;
  if (products.length > 1) {
    const first = names[0];
    while (
      prefixLen < first.length &&
      names.every((n) => n[prefixLen] === first[prefixLen])
    ) {
      prefixLen++;
    }
    const allSameName = names.every((n) => n === first);
    // Only cut on a word boundary so "WOMENS CML" doesn't become "ML".
    while (!allSameName && prefixLen > 0 && !/[\s\-|/]/.test(first[prefixLen - 1] ?? "")) {
      prefixLen--;
    }
  }
  products.forEach((p, i) => {
    const own = String(p.color ?? "").trim();
    if (own) {
      result.set(p.id, own);
      return;
    }
    if (products.length > 1) {
      const suffix = names[i].slice(prefixLen).replace(/^[\s\-|/]+/, "").trim();
      // Same name on every product (e.g. MRP duplicates) → no colour to show.
      if (suffix) result.set(p.id, suffix.toUpperCase());
    }
  });
  return result;
}

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
    /** When variants come from several products: colour + name per product id. */
    products?: SizeGridProductInfo[];
  },
): MergedSizeGridVariant[] {
  const colorByProduct = buildSizeGridColorByProduct(options?.products ?? []);
  const nameByProduct = new Map(
    (options?.products ?? []).map((p) => [p.id, p.product_name ?? undefined]),
  );
  const effectiveColor = (v: T): string =>
    String(v.color ?? "").trim() ||
    (v.product_id ? colorByProduct.get(v.product_id) : undefined) ||
    options?.defaultColor ||
    "";

  const groups = new Map<string, T[]>();
  for (const v of variants) {
    const key = sizeColorKey(v.size, effectiveColor(v));
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
      product_id: rep.product_id,
      product_name: rep.product_id ? nameByProduct.get(rep.product_id) || undefined : undefined,
      size: rep.size || "",
      color: effectiveColor(rep) || defaultColor,
      barcode: rep.barcode,
      sale_price: rep.sale_price || 0,
      mrp: rep.mrp || 0,
      pur_price: rep.pur_price ?? undefined,
      stock_qty: Math.max(0, totalStock - cartReserved),
    };
  });
}
