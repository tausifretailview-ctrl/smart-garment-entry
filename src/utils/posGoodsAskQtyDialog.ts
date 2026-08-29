/** Settings → POS → ask qty/discount before adding regular goods from search dropdown. */
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
