/**
 * Prices a new size starts with in the purchase size grid ("Add Size" under a colour).
 *
 * KS Footwear: a new colour's sizes all took the product's old price as MRP, because
 * the multi-colour Add Size box had no MRP field and the fallback was the sale price.
 * Order, per price:
 *   1. what the user typed for the previous new size of this colour (so one MRP typed
 *      for a new colour carries to its next sizes),
 *   2. explicit defaults passed to the grid,
 *   3. one existing size of this colour, else of the product (in Purchase the grid
 *      only holds the MRP tier picked in search), so Pur / Sale / MRP come as a set,
 *   4. the product defaults.
 * MRP falls back to the sale price only when no size of the product has an MRP.
 *
 * KS Footwear AT28: a new colour took Pur/Sale from the product defaults (old MRP 429
 * tier: 248.82 / 308.88) but MRP from the grid's sizes (489), instead of the 489
 * tier's own 283.62 / 342. Product defaults carry no MRP, so they go last.
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

/** First size with a sale price (else an MRP): its prices belong to one tier. */
function priceSource(rows: PricedSize[]): PricedSize | undefined {
  return (
    rows.find((row) => Number(row.sale_price) > 0) ?? rows.find((row) => Number(row.mrp) > 0)
  );
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
  const source = priceSource(args.colorVariants) ?? priceSource(args.allVariants);

  const pur_price = firstPositive(
    previous?.pur_price,
    args.defaultPurPrice,
    source?.pur_price,
    firstPositiveOf(args.colorVariants, "pur_price"),
    firstPositiveOf(args.allVariants, "pur_price"),
    args.productPurPrice,
  );
  const sale_price = firstPositive(
    previous?.sale_price,
    args.defaultSalePrice,
    source?.sale_price,
    firstPositiveOf(args.colorVariants, "sale_price"),
    firstPositiveOf(args.allVariants, "sale_price"),
    args.productSalePrice,
  );
  const mrp = firstPositive(
    previous?.mrp,
    args.defaultMrp,
    source?.mrp,
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

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * MRP typed for a new size / colour, Pur and Sale left blank: keep the same margin
 * as the starting prices instead of the old ₹ amounts. KS Footwear sells at MRP −28%
 * and buys at ~58% of MRP, so MRP 249 on a ₹219 product must give Sale 179.28, not
 * the old 157.68. Same MRP (or none typed) → starting prices unchanged.
 */
export function pricesForTypedMrp(
  start: SizeGridNewSizePrices,
  typedMrp: number,
): SizeGridNewSizePrices {
  if (!(typedMrp > 0)) return start;
  if (!(start.mrp > 0) || Math.abs(typedMrp - start.mrp) < 0.005) {
    return { ...start, mrp: typedMrp };
  }
  const ratio = typedMrp / start.mrp;
  return {
    mrp: typedMrp,
    sale_price: start.sale_price > 0 ? round2(start.sale_price * ratio) : 0,
    pur_price: start.pur_price > 0 ? round2(start.pur_price * ratio) : 0,
  };
}
