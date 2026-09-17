/**
 * Retail ERP / Gurukrupa A5 line rate + discount used on the printed invoice.
 *
 * Standard Retail ERP shows list/MRP in Rate and nets in Amount (discount in totals).
 * Gurukrupa bills the cashier's unit price: after POS "edit unit price", Rate must be
 * the saved unit_price — not the old variant sale_price / MRP.
 */

export function retailErpLineDisplayRate(
  item: { mrp?: number | null; rate?: number | null },
  billedUnitRate: boolean,
): number {
  const rate = Number(item.rate || 0);
  if (billedUnitRate) return rate;
  const mrp = Number(item.mrp || 0);
  return mrp > 0 && mrp > rate ? mrp : rate;
}

export function retailErpLineGross(
  item: { mrp?: number | null; rate?: number | null; qty?: number | null },
  billedUnitRate: boolean,
): number {
  return retailErpLineDisplayRate(item, billedUnitRate) * (Number(item.qty) || 0);
}

/**
 * Bill-level Discount row. Gurukrupa uses the gap vs billed unit rates so an
 * edited unit price is not reprinted as a phantom MRP discount.
 */
export function retailErpDisplayDiscount(opts: {
  billedUnitRate: boolean;
  propDiscount: number;
  computedFromLines: number;
}): number {
  const computed = Math.max(0, Number(opts.computedFromLines) || 0);
  if (opts.billedUnitRate) return computed > 0.005 ? computed : 0;
  const prop = Math.max(0, Number(opts.propDiscount) || 0);
  return prop > 0.005 ? prop : computed > 0.005 ? computed : 0;
}
