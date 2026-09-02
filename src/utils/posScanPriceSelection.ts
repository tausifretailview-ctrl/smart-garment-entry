/** ₹ tolerance for master vs last-purchase price drift on POS scan. */
export const POS_PRICE_DRIFT_TOLERANCE = 0.01;

export function posVariantDisplayMrp(
  variant: {
    mrp?: number | string | null;
    sale_price?: number | string | null;
  },
  product?: { default_sale_price?: number | string | null } | null,
): number {
  const rawMrp = parseFloat(String(variant.mrp ?? 0)) || 0;
  if (rawMrp > 0) return rawMrp;
  const sale = parseFloat(String(variant.sale_price ?? 0)) || 0;
  if (sale > 0) return sale;
  const defaultSale = parseFloat(String(product?.default_sale_price ?? 0)) || 0;
  return defaultSale > 0 ? defaultSale : 0;
}

/** Rounded paise key for comparing MRP tiers on duplicate barcodes. */
export function posMrpTierKey(mrp: number): number {
  return Math.round(mrp * 100);
}

/**
 * Compound tier key: MRP and sale price rounded to paise, joined.
 * Two variants can share the exact same statutory MRP (Jockey/Enamor —
 * the printed MRP never changes between purchase batches) while their
 * sale_price genuinely differs between an old stock batch and a newly
 * purchased one. Keying on MRP alone missed this; either field differing
 * must count as a distinct tier.
 */
function posPriceTierKey(
  variant: { mrp?: number | string | null; sale_price?: number | string | null },
  product?: { default_sale_price?: number | string | null } | null,
): string {
  const mrp = posMrpTierKey(posVariantDisplayMrp(variant, product));
  const salePrice = Math.round((parseFloat(String(variant.sale_price ?? 0)) || 0) * 100);
  return `${mrp}|${salePrice}`;
}

/**
 * When multiple variants share a barcode at different MRP AND/OR sale price
 * tiers, force the picker even if only one tier is in stock (KS Footwear /
 * shared EAN relabel pattern; Jockey/Enamor old-vs-new-stock sale price).
 */
export function posBarcodeMatchesNeedMrpPicker(
  matches: Array<{
    variant: { mrp?: number | string | null; sale_price?: number | string | null };
    product?: { default_sale_price?: number | string | null } | null;
  }>,
): boolean {
  if (matches.length <= 1) return false;
  const tiers = new Set(matches.map((m) => posPriceTierKey(m.variant, m.product)));
  return tiers.size > 1;
}

/**
 * Show master vs last-purchase dialog when either sale price OR MRP drifted.
 * Previously only sale_price was checked — MRP-only drift (164.5 master vs 204.5
 * last purchase) silently used stale master MRP on scan.
 */
export function shouldPromptPosPriceSelection(params: {
  askPriceOnScan: boolean;
  hasOverridePrice: boolean;
  /** When POS bills at MRP (pos_barcode_price_mode = mrp), skip — sale-price drift is irrelevant. */
  posUsesMrpAsPrice?: boolean;
  masterSalePrice: number;
  masterMrp: number;
  lastPurchaseSalePrice: number | null;
  lastPurchaseMrp: number | null;
  tolerance?: number;
}): boolean {
  if (!params.askPriceOnScan || params.hasOverridePrice) return false;
  if (params.posUsesMrpAsPrice) return false;
  const tol = params.tolerance ?? POS_PRICE_DRIFT_TOLERANCE;

  if (
    params.lastPurchaseSalePrice !== null &&
    Math.abs(params.lastPurchaseSalePrice - params.masterSalePrice) > tol
  ) {
    return true;
  }

  if (
    params.lastPurchaseMrp !== null &&
    Math.abs(params.lastPurchaseMrp - params.masterMrp) > tol
  ) {
    return true;
  }

  return false;
}
