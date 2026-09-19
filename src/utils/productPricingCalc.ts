/**
 * Product-entry pricing helpers for Purchase → Markup → (MRP) → Sale.
 *
 * When `purchase_settings.show_mrp === true`:
 *   MRP = round(purchase * (1 + markup%/100))
 *   Sale = round(MRP * (1 - saleDisc%/100))
 *
 * When show_mrp is false/null (caller passes showMrp=false):
 *   Sale = round(purchase * (1 + markup%/100))  — legacy direct path
 *
 * The sale-disc % used here is MRP pricing. Persist it on
 * products.pricing_sale_disc_percent so labels can read it. It must NOT be
 * written to product.sale_discount_type / sale_discount_value (those drive
 * live POS catalogue discount via product_entry_discount_enabled).
 */

export function calcMarkedUpPrice(purchasePrice: number, markupPercent: number): number {
  return Math.round(purchasePrice * (1 + markupPercent / 100));
}

export function calcSaleFromMrp(mrp: number, saleDiscPercent: number): number {
  const disc = Number.isFinite(saleDiscPercent) ? saleDiscPercent : 0;
  return Math.round(mrp * (1 - disc / 100));
}

export type PurchaseMarkupPricingResult = {
  /** Set only when showMrp is true (markup target is MRP). */
  mrp?: number;
  salePrice: number;
};

/**
 * Apply Purchase + Markup% → sale (and MRP when showMrp).
 * Caller must only pass showMrp=true when purchase_settings.show_mrp === true.
 */
export function applyPurchaseMarkupPricing(opts: {
  showMrp: boolean;
  purchasePrice: number;
  markupPercent: number;
  /** Ephemeral pricing disc %; ignored when showMrp is false. */
  saleDiscPercent?: number;
}): PurchaseMarkupPricingResult {
  const marked = calcMarkedUpPrice(opts.purchasePrice, opts.markupPercent);
  if (opts.showMrp) {
    return {
      mrp: marked,
      salePrice: calcSaleFromMrp(marked, opts.saleDiscPercent ?? 0),
    };
  }
  return { salePrice: marked };
}

/** Parse a percent string from an input; empty/invalid → NaN (caller decides). */
export function parsePricingPercent(raw: string): number {
  return parseFloat(raw);
}

/**
 * Persistable Sale Disc % from the MRP pricing field.
 * Blank, 0, or invalid → null (label must not print "DIS: 0%").
 */
export function normalizePricingSaleDiscPercent(
  raw: string | number | null | undefined,
): number | null {
  if (raw === "" || raw == null) return null;
  const n = typeof raw === "number" ? raw : parseFloat(String(raw).trim());
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function pricingSaleDiscPercentInputValue(
  stored: number | null | undefined,
): string {
  const n = normalizePricingSaleDiscPercent(stored);
  return n == null ? "" : String(n);
}
