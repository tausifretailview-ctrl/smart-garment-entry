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
