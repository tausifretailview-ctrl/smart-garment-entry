/**
 * Prices a new size starts with in the purchase size grid ("Add Size" under a colour).
 *
 * KS Footwear: a new colour's sizes all took the product's old price as MRP, because
 * the multi-colour Add Size box had no MRP field and the fallback was the sale price.
 * Order, per price:
 *   1. what the user typed for the previous new size of this colour (so one MRP typed
 *      for a new colour carries to its next sizes),
 *   2. explicit defaults passed to the grid,
 *   3. this colour's existing sizes,
 *   4. the product defaults, then any other size of the product.
 * MRP falls back to the sale price only when no size of the product has an MRP.
 */

type PricedSize = {
  pur_price?: number | null;
  sale_price?: number | null;
  mrp?: number | null;
};

export type SizeGridNewSizePrices = {
  pur_price: number;
  sale_price: number;
  mrp: number;
};

function firstPositive(...values: Array<number | null | undefined>): number {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n) && n > 0) return n;
  }
  return 0;
}

function firstPositiveOf(rows: PricedSize[], key: keyof PricedSize): number {
  return firstPositive(...rows.map((row) => row[key]));
}

export function sizeGridNewSizePrices(args: {
  /** Sizes of the colour the new size is added to (empty for a brand-new colour). */
  colorVariants: PricedSize[];
  /** Every size of the product, all colours. */
  allVariants: PricedSize[];
  /** New sizes already added to this colour in the open grid, oldest first. */
  addedSizes?: PricedSize[];
  defaultPurPrice?: number | null;
  defaultSalePrice?: number | null;
  defaultMrp?: number | null;
  productPurPrice?: number | null;
  productSalePrice?: number | null;
}): SizeGridNewSizePrices {
  const previous = args.addedSizes?.[args.addedSizes.length - 1];

  const pur_price = firstPositive(
    previous?.pur_price,
    args.defaultPurPrice,
    firstPositiveOf(args.colorVariants, "pur_price"),
    args.productPurPrice,
    firstPositiveOf(args.allVariants, "pur_price"),
  );
  const sale_price = firstPositive(
    previous?.sale_price,
    args.defaultSalePrice,
    firstPositiveOf(args.colorVariants, "sale_price"),
    args.productSalePrice,
    firstPositiveOf(args.allVariants, "sale_price"),
  );
  const mrp = firstPositive(
    previous?.mrp,
    args.defaultMrp,
    firstPositiveOf(args.colorVariants, "mrp"),
    firstPositiveOf(args.allVariants, "mrp"),
    sale_price,
  );

  return { pur_price, sale_price, mrp };
}

/** Typed value when it is a positive number, otherwise the fallback. */
export function typedPriceOr(typed: string | undefined, fallback: number): number {
  const n = Number(typed);
  return typed != null && typed.trim() !== "" && Number.isFinite(n) && n > 0 ? n : fallback;
}
