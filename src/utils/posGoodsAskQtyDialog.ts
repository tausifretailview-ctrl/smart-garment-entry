/** Settings → POS → ask qty/discount before adding regular goods (search dropdown or barcode scan). */
export function isPosGoodsAskQtyDialogEnabled(
  saleSettings?: { pos_goods_ask_qty_dialog?: boolean | null } | null,
): boolean {
  return saleSettings?.pos_goods_ask_qty_dialog === true;
}

/** Pre-fill price for the goods qty dialog (respects MRP vs sale_price basis). */
export function resolveGoodsQtyDialogDefaultPrice(
  variant: { sale_price?: number | string | null; mrp?: number | string | null },
  grossBasis: "mrp" | "sale_price",
): number {
  const salePrice = parseFloat(String(variant.sale_price || 0)) || 0;
  const rawMrp = variant.mrp ? parseFloat(String(variant.mrp)) : 0;
  const mrp = rawMrp > 0 ? rawMrp : salePrice;
  if (grossBasis === "mrp") return mrp;
  return salePrice > 0 ? salePrice : mrp;
}

/** Settings → Sale → ask quantity before adding regular goods on the Sales Invoice. Default off. */
export function isSaleGoodsAskQtyDialogEnabled(
  saleSettings?: { sale_goods_ask_qty_dialog?: boolean | null } | null,
): boolean {
  return saleSettings?.sale_goods_ask_qty_dialog === true;
}

/**
 * Sales Invoice goods Qty window → price for the line. Only a price the user changed is applied
 * (as sale price, MRP kept at least as high); unchanged keeps the normal price rules
 * (customer price memory, last purchase price, scheme discounts).
 */
export function saleGoodsQtyDialogOverride(
  enteredPrice: number,
  defaultPrice: number,
  masterMrp: number,
): { sale_price: number; mrp: number } | undefined {
  const entered = Number(enteredPrice) || 0;
  if (entered <= 0 || Math.abs(entered - (Number(defaultPrice) || 0)) < 0.005) return undefined;
  return { sale_price: entered, mrp: Math.max(entered, Number(masterMrp) || 0) };
}
