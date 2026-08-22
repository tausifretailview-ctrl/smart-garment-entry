/** ₹ tolerance for master vs last-purchase price drift on POS scan. */
export const POS_PRICE_DRIFT_TOLERANCE = 0.01;

export function posVariantDisplayMrp(variant: {
  mrp?: number | string | null;
  sale_price?: number | string | null;
}): number {
  const sale = parseFloat(String(variant.sale_price ?? 0)) || 0;
  const rawMrp = parseFloat(String(variant.mrp ?? 0)) || 0;
  return rawMrp > 0 ? rawMrp : sale;
}

/** Rounded paise key for comparing MRP tiers on duplicate barcodes. */
export function posMrpTierKey(mrp: number): number {
  return Math.round(mrp * 100);
}

/**
 * When multiple variants share a barcode at different MRP tiers, force the picker
 * even if only one tier is in stock (KS Footwear / shared EAN relabel pattern).
 */
export function posBarcodeMatchesNeedMrpPicker(
  matches: Array<{ variant: { mrp?: number | string | null; sale_price?: number | string | null } }>,
): boolean {
  if (matches.length <= 1) return false;
  const tiers = new Set(matches.map((m) => posMrpTierKey(posVariantDisplayMrp(m.variant))));
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
  masterSalePrice: number;
  masterMrp: number;
  lastPurchaseSalePrice: number | null;
  lastPurchaseMrp: number | null;
  tolerance?: number;
}): boolean {
  if (!params.askPriceOnScan || params.hasOverridePrice) return false;
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
