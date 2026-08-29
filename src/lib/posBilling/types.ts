/**
 * Shared POS cart / bill types for the headless billing engine.
 * CartItem shape must stay identical to what POSSales persisted historically.
 */

export interface PosCartItem {
  id: string;
  barcode: string;
  productName: string;
  /** DB products.product_name only (no brand/category/style join). */
  baseProductName?: string;
  /** Product category — used for quantity-tier bundle pricing when enabled. */
  category?: string | null;
  /** Set when category tier pricing repriced this line (wins over MRP-mode discount). */
  categoryTierApplied?: boolean;
  /**
   * Pre-tier unit sale price used to rematch (category + price) after a bundle
   * reprice overwrites `unitCost` with the allocated per-unit rate.
   */
  categoryTierListPrice?: number;
  size: string;
  color: string;
  quantity: number;
  mrp: number;
  originalMrp: number | null;
  gstPer: number;
  /** Purchase GST % — sub-threshold base for garment/footwear auto rule. */
  purchaseGstPer?: number;
  discountPercent: number;
  discountAmount: number;
  unitCost: number;
  /**
   * Cart-only: who last set the rate on this line.
   * 'unit' = typed unit price (Disc% cleared); 'discount' = Disc% / Disc Rs / scan default.
   */
  rateAuthority?: "unit" | "discount";
  netAmount: number;
  productId: string;
  variantId: string;
  hsnCode?: string;
  productType?: string;
  isDcProduct?: boolean;
  uom?: string;
  showDiscount?: boolean;
  itemNotes?: string | null;
  /**
   * Scan-time snapshot of `product_variants.stock_qty` for the cart stock-status dot.
   * - Taken once at add; not refreshed while the bill is open (v1 — bills are short-lived).
   * - `null` / `undefined` = unknown or not stock-tracked (service/combo, custom size without
   *   variantId, edit-restore without a snapshot) → render no badge.
   * - Edit-invoice caveat: does not include `freedQty` from the bill being edited, so the dot
   *   can look slightly pessimistic vs `checkStock`. Informational only — never blocks save.
   */
  stockQty?: number | null;
}

/** Alias kept for call-site familiarity with POSSales. */
export type CartItem = PosCartItem;

export type PosFlatDiscountMode = "percent" | "amount";

/** Explicit gross / add-price basis — never looked up from settings inside the engine. */
export type PosGrossBasis = "mrp" | "sale_price";

export type PosBillingErrorCode =
  | "DISCOUNT_CAP"
  | "UNIT_PRICE_BELOW_MIN"
  | "INVALID_QTY"
  | "INVALID_DISCOUNT"
  | "INVALID_UNIT_PRICE";

export type PosBillingError = {
  code: PosBillingErrorCode;
  message: string;
  /** Cap toast uses maxCombinedDiscountForGross(mrpTotal). */
  mrpTotal?: number;
  maxCombined?: number;
  minUnit?: number;
};

export type PosBillTotals = {
  quantity: number;
  mrp: number;
  discount: number;
  subtotal: number;
  savings: number;
  flatDiscountAmount: number;
  flatDiscountPercent: number;
  flatDiscountCapped: boolean;
  maxFlatDiscountForGross: number;
  taxableSubtotal: number;
  totalGst: number;
  amountBeforeRoundOff: number;
  calculatedRoundOff: number;
  pointsRedemptionValue: number;
  finalAmount: number;
  amountBeforeCredit: number;
};

export type SaleRowForFlatResolve = {
  gross_amount?: number | null;
  discount_amount?: number | null;
  flat_discount_amount?: number | null;
  flat_discount_percent?: number | null;
};

export type SaleItemRowForFlatResolve = {
  line_total?: number | null;
  per_qty_net_amount?: number | null;
  quantity?: number | null;
  mrp?: number | null;
  unit_price?: number | null;
  discount_percent?: number | null;
};
