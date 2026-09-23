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

/** Paise. Pools below one rupee are not cashier flat discounts (POS amount entry is whole rupees). */
export const RETAIL_ERP_BILL_POOL_DUST_LIMIT = 1;

export function roundRetailErpMoney(amount: number): number {
  return Math.round((Number(amount) || 0) * 100) / 100;
}

/**
 * Spread a bill-level amount across lines by gross weight.
 * Each share is rounded to paise; the last line takes the remainder so the
 * shares sum to `totalToAllocate`.
 */
export function allocateByGrossWeight(grosses: number[], totalToAllocate: number): number[] {
  if (grosses.length === 0 || totalToAllocate <= 0.005) return grosses.map(() => 0);
  const grossTotal = grosses.reduce((sum, gross) => sum + gross, 0);
  if (grossTotal <= 0.005) return grosses.map(() => 0);
  const shares: number[] = [];
  let allocated = 0;
  for (let i = 0; i < grosses.length; i++) {
    if (i === grosses.length - 1) {
      shares.push(roundRetailErpMoney(totalToAllocate - allocated));
    } else {
      const share = roundRetailErpMoney((grosses[i] / grossTotal) * totalToAllocate);
      shares.push(share);
      allocated += share;
    }
  }
  return shares;
}

export type RetailErpPoolDisposition = "none" | "allocate" | "round-off" | "discount-row";

/**
 * What to do with `displayDiscount` that is not already on the lines.
 *
 * - `allocate`: genuine bill discount (at least ₹1). Smear it so each printed
 *   amount includes it, and the page total must sum those same amounts.
 * - `round-off`: sub-rupee residue with no stored discount behind it
 *   (gross vs net/round-off/adjustments). Do not touch the lines; the
 *   existing Round Off row absorbs it.
 * - `discount-row`: sub-rupee residue that is a stored discount, or any
 *   sub-rupee residue on a variant that does not print Round Off
 *   (Gurukrupa, DC). Leave it on the Discount row; do not smear the lines.
 */
export function retailErpPoolDisposition(opts: {
  flatDiscountPool: number;
  propDiscount: number;
  roundOffRowHidden: boolean;
}): RetailErpPoolDisposition {
  const pool = Math.max(0, roundRetailErpMoney(opts.flatDiscountPool));
  if (pool <= 0.005) return "none";
  if (pool >= RETAIL_ERP_BILL_POOL_DUST_LIMIT) return "allocate";
  if (opts.roundOffRowHidden || Math.max(0, Number(opts.propDiscount) || 0) > 0.005) {
    return "discount-row";
  }
  return "round-off";
}

export type RetailErpLinePrintPlan = {
  flatDiscountPool: number;
  disposition: RetailErpPoolDisposition;
  lineBillDiscounts: number[];
  lineNetAmounts: number[];
};

/** Printed line nets for the Retail ERP family. Page totals must sum `lineNetAmounts`. */
export function retailErpLinePrintPlan(args: {
  grosses: number[];
  lineTotals: number[];
  displayDiscount: number;
  propDiscount: number;
  roundOffRowHidden: boolean;
}): RetailErpLinePrintPlan {
  const grosses = args.grosses;
  const lineTotals = args.lineTotals;
  const lineItemDiscounts = grosses.map((gross, i) =>
    Math.max(0, roundRetailErpMoney(gross - Number(lineTotals[i] || 0))),
  );
  const lineItemDiscountSum = lineItemDiscounts.reduce((sum, discount) => sum + discount, 0);
  const flatDiscountPool = Math.max(
    0,
    roundRetailErpMoney((Number(args.displayDiscount) || 0) - lineItemDiscountSum),
  );
  const disposition = retailErpPoolDisposition({
    flatDiscountPool,
    propDiscount: args.propDiscount,
    roundOffRowHidden: args.roundOffRowHidden,
  });
  const shares = allocateByGrossWeight(grosses, disposition === "allocate" ? flatDiscountPool : 0);
  const lineBillDiscounts = lineItemDiscounts.map((discount, i) =>
    roundRetailErpMoney(discount + shares[i]),
  );
  const lineNetAmounts = grosses.map((gross, i) =>
    roundRetailErpMoney(gross - lineBillDiscounts[i]),
  );
  return { flatDiscountPool, disposition, lineBillDiscounts, lineNetAmounts };
}

/** Letter-pad (preprinted) Note: composition dealer cannot collect GST. */
export const LETTERPAD_COMPOSITION_DECLARATION =
  "Composition Taxable Person Not Eligible To Collect GST From Customer";

const GENERIC_CERTIFIED_DECLARATION =
  /^certified that the particulars given above are true and correct\.?$/i;

/**
 * Retail ERP "Note:" body. Preprinted letter-pad always includes the composition
 * declaration; other variants still print only the sale note.
 */
export function retailErpLetterpadNoteText(opts: {
  isPreprinted: boolean;
  saleNote?: string | null;
  declarationText?: string | null;
}): string {
  const saleNote = (opts.saleNote || "").trim();
  const usableSaleNote = saleNote && !/^\d+$/.test(saleNote) ? saleNote : "";
  if (!opts.isPreprinted) return usableSaleNote;

  const rawDecl = (opts.declarationText || "").trim();
  const declaration =
    rawDecl && !GENERIC_CERTIFIED_DECLARATION.test(rawDecl)
      ? rawDecl
      : LETTERPAD_COMPOSITION_DECLARATION;

  if (!usableSaleNote) return declaration;
  if (usableSaleNote.toLowerCase().includes(declaration.toLowerCase())) return usableSaleNote;
  return `${usableSaleNote}\n${declaration}`;
}
