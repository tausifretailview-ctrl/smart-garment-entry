export const KS_FOOTWEAR_SLUG = "ks-footwear";

export function isKsFootwearSlug(slug: string | null | undefined): boolean {
  return String(slug || "").trim().toLowerCase() === KS_FOOTWEAR_SLUG;
}

export type SaleScanPriceSource = "ask" | "master" | "last_purchase";

/**
 * When last-purchase sale/MRP differs from master, either ask, use master, or
 * use last purchase. KS Footwear defaults to last purchase so Select Price is
 * not shown on every add (FL505 7: master ₹258.65 vs last ₹230.65).
 *
 * Explicit `auto_use_last_purchase_price` in sale_settings overrides the slug default.
 */
export function resolveSaleScanPriceSource(params: {
  orgSlug?: string | null;
  askPriceOnScan?: boolean;
  autoUseLastPurchasePrice?: boolean | null;
}): SaleScanPriceSource {
  if (params.autoUseLastPurchasePrice === true) return "last_purchase";
  if (params.autoUseLastPurchasePrice === false) {
    return params.askPriceOnScan === false ? "master" : "ask";
  }
  if (isKsFootwearSlug(params.orgSlug)) return "last_purchase";
  if (params.askPriceOnScan === false) return "master";
  return "ask";
}

export function pickLastPurchaseScanPrice(params: {
  masterSalePrice: number;
  masterMrp: number;
  lastPurchaseSalePrice: number | null;
  lastPurchaseMrp: number | null;
}): { sale_price: number; mrp: number } | null {
  const lastSale =
    params.lastPurchaseSalePrice != null && Number.isFinite(params.lastPurchaseSalePrice)
      ? params.lastPurchaseSalePrice
      : null;
  const lastMrp =
    params.lastPurchaseMrp != null && Number.isFinite(params.lastPurchaseMrp)
      ? params.lastPurchaseMrp
      : null;
  if ((lastSale == null || lastSale <= 0) && (lastMrp == null || lastMrp <= 0)) {
    return null;
  }
  const sale_price = lastSale != null && lastSale > 0 ? lastSale : params.masterSalePrice;
  const mrp =
    lastMrp != null && lastMrp > 0 ? lastMrp : sale_price > 0 ? sale_price : params.masterMrp;
  if (sale_price <= 0) return null;
  return { sale_price, mrp };
}
