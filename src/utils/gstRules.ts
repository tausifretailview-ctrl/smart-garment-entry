/**
 * Garment / Footwear GST Auto-Bump Rule
 *
 * Per Indian GST law: garments & footwear above a certain price (e.g. ₹1000)
 * attract 18% GST instead of 5%. Threshold is configurable per-org.
 *
 * Behaviour:
 *  - When effective price > threshold => bumps current GST up to 18% (if lower).
 *  - When effective price <= threshold => restores GST to baseGst (purchase GST).
 *  - Manual selections higher than 18% are always preserved.
 *  - "Effective price" should be the post-discount per-unit price (net unit price),
 *    not raw MRP — so discount-driven downgrades work (e.g. MRP 3000 -20% = 2400).
 */
export interface GarmentGstRuleSettings {
  garment_gst_rule_enabled?: boolean;
  garment_gst_threshold?: number;
}

export const DEFAULT_GARMENT_GST_THRESHOLD = 2625;
export const GARMENT_BUMPED_GST = 18;

export function isGarmentGstRuleEnabled(
  settings?: GarmentGstRuleSettings | null
): boolean {
  return !!settings?.garment_gst_rule_enabled;
}

export function getGarmentGstThreshold(
  settings?: GarmentGstRuleSettings | null
): number {
  const t = settings?.garment_gst_threshold;
  return typeof t === 'number' && t > 0 ? t : DEFAULT_GARMENT_GST_THRESHOLD;
}

/**
 * Apply rule. Returns the GST % that should be set.
 * - If rule enabled AND salePrice > threshold => 18 (only if currentGst < 18)
 * - Else returns currentGst unchanged
 */
export function applyGarmentGstRule(
  salePrice: number | null | undefined,
  currentGst: number,
  settings?: GarmentGstRuleSettings | null,
  baseGst?: number | null
): number {
  if (!isGarmentGstRuleEnabled(settings)) return currentGst;
  const threshold = getGarmentGstThreshold(settings);
  const price = Number(salePrice) || 0;
  if (price > threshold && currentGst < GARMENT_BUMPED_GST) {
    return GARMENT_BUMPED_GST;
  }
  // Below / equal to threshold: restore to baseGst (purchase GST) when the
  // current GST was previously auto-bumped. Preserve manual overrides > 18%.
  if (price > 0 && price <= threshold && baseGst != null) {
    const base = Number(baseGst) || 0;
    if (currentGst <= GARMENT_BUMPED_GST && currentGst !== base) {
      return base;
    }
  }
  return currentGst;
}

/**
 * True when the rule would currently bump the GST for this price.
 * Useful for showing the "Auto 18% (>₹X)" chip in the UI.
 */
export function isGarmentGstAutoBumped(
  salePrice: number | null | undefined,
  settings?: GarmentGstRuleSettings | null
): boolean {
  if (!isGarmentGstRuleEnabled(settings)) return false;
  const threshold = getGarmentGstThreshold(settings);
  return (Number(salePrice) || 0) > threshold;
}

/** Per-unit net selling price after line-level discounts (used for threshold checks). */
export function getEffectiveUnitSalePrice(params: {
  unitPrice: number;
  quantity?: number;
  discountPercent?: number;
  discountAmount?: number;
  /** POS: per-unit gap when billing rate is below line MRP. */
  implicitUnitDiscount?: number;
}): number {
  const qty = Math.max(Number(params.quantity) || 0, 1);
  const unit = Math.max(Number(params.unitPrice) || 0, 0);
  const base = unit * qty;
  const pctDisc = (base * (Number(params.discountPercent) || 0)) / 100;
  const implicit = (Number(params.implicitUnitDiscount) || 0) * qty;
  const net = base - pctDisc - (Number(params.discountAmount) || 0) - implicit;
  return Math.max(0, net / qty);
}

/**
 * Resolve Sale GST % for a line using purchase GST as the sub-threshold base.
 */
export function resolveGarmentGstForLine(
  effectiveUnitPrice: number,
  purchaseGst: number,
  saleGst: number,
  settings?: GarmentGstRuleSettings | null
): number {
  const base = Number(purchaseGst) || 0;
  const sale = Number(saleGst) || base;
  return applyGarmentGstRule(effectiveUnitPrice, sale, settings, base);
}