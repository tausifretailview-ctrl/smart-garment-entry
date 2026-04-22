/**
 * Garment / Footwear GST Auto-Bump Rule
 *
 * Per Indian GST law: garments & footwear above a certain price (e.g. ₹1000)
 * attract 18% GST instead of 5%. Threshold is configurable per-org.
 *
 * Behaviour:
 *  - Only UPGRADES current GST to 18% — never downgrades.
 *  - Manual selections higher than 18% are preserved.
 *  - When sale price drops back below threshold, callers should reset GST
 *    to the purchase GST themselves (this helper is stateless).
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
  settings?: GarmentGstRuleSettings | null
): number {
  if (!isGarmentGstRuleEnabled(settings)) return currentGst;
  const threshold = getGarmentGstThreshold(settings);
  const price = Number(salePrice) || 0;
  if (price > threshold && currentGst < GARMENT_BUMPED_GST) {
    return GARMENT_BUMPED_GST;
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