/** Fields on `sale_items` needed to resolve return unit price from an original sale. */
export type SaleItemPriceFields = {
  unit_price?: number | null;
  per_qty_net_amount?: number | null;
  net_after_discount?: number | null;
  line_total?: number | null;
  quantity?: number | null;
  discount_percent?: number | null;
};

export type SaleReturnPriceOptions = {
  /** Settings: return at pre–flat-discount unit rate (exchange scenarios). */
  useOriginalPrice?: boolean;
  /** Bill-level flat discount on the linked sale (₹). */
  billFlatDiscount?: number;
  /** Bill-level round-off on the linked sale (₹). */
  billRoundOff?: number;
};

const n = (v: unknown) => Number(v) || 0;

/**
 * Unit price to credit on a sale return — matches what the customer paid on the bill.
 * - Manual / overridden sale rate → `unit_price` / `line_total`
 * - Line % discount → reflected in `line_total`
 * - Bill flat discount / round-off → `per_qty_net_amount` / `net_after_discount`
 */
export function resolveSaleReturnUnitPrice(
  item: SaleItemPriceFields,
  opts: SaleReturnPriceOptions = {},
): number {
  const qty = Math.max(n(item.quantity), 1);
  const unitPrice = n(item.unit_price);
  const lineTotal = n(item.line_total);
  const perQty = n(item.per_qty_net_amount);
  const netAfter = n(item.net_after_discount);
  const fromLine = lineTotal > 0.005 ? lineTotal / qty : 0;
  const fromPerQty = perQty > 0.005 ? perQty : 0;
  const fromNetAfter = netAfter > 0.005 ? netAfter / qty : 0;

  if (opts.useOriginalPrice) {
    if (unitPrice > 0.005) return unitPrice;
    if (fromLine > 0.005) return fromLine;
    if (fromPerQty > 0.005) return fromPerQty;
    return 0;
  }

  const billHasFlatOrRound =
    n(opts.billFlatDiscount) > 0.01 || Math.abs(n(opts.billRoundOff)) > 0.001;

  if (fromNetAfter > 0.005) return fromNetAfter;

  if (billHasFlatOrRound) {
    if (fromPerQty > 0.005) return fromPerQty;
    if (fromLine > 0.005) return fromLine;
    if (unitPrice > 0.005) return unitPrice;
    return 0;
  }

  // No bill-level flat: trust billed line rate (manual price / line % disc), not stale per_qty
  if (fromLine > 0.005) return fromLine;
  if (unitPrice > 0.005) return unitPrice;
  if (fromPerQty > 0.005) return fromPerQty;
  return 0;
}

export function resolveSaleReturnLineTotal(
  item: SaleItemPriceFields,
  returnQty: number,
  opts: SaleReturnPriceOptions = {},
): number {
  const qty = Math.max(n(item.quantity), 1);
  const unit = resolveSaleReturnUnitPrice(item, opts);
  if (returnQty >= qty && n(item.net_after_discount) > 0.005) {
    return Math.round(n(item.net_after_discount) * 100) / 100;
  }
  return Math.round(unit * returnQty * 100) / 100;
}
