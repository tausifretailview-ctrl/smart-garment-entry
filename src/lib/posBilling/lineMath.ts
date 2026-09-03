import { resolveGarmentGstForLine, type GarmentGstRuleSettings } from "@/utils/gstRules";
import type { PosCartItem } from "./types";

const SCHEME_EXTRA_EPS = 0.005;

/** Extra cashier discount on top of the scheme line total (₹). Disc ₹ wins over Disc%. */
export function extraDiscountOnSchemeLine(
  item: Pick<PosCartItem, "discountPercent" | "discountAmount">,
  schemeLineTotal: number,
): number {
  const cap = Math.max(0, Number(schemeLineTotal) || 0);
  const amount = Math.max(0, Number(item.discountAmount) || 0);
  if (amount > SCHEME_EXTRA_EPS) {
    return Math.min(cap, Math.round(amount * 100) / 100);
  }
  const pct = Math.max(0, Math.min(100, Number(item.discountPercent) || 0));
  if (pct <= SCHEME_EXTRA_EPS) return 0;
  return Math.min(cap, Math.round(((cap * pct) / 100) * 100) / 100);
}

/** Line net: MRP×qty minus Disc%, Disc Rs, and any gap when unit price is below MRP. */
export function calculatePosCartLineNet(item: PosCartItem): number {
  const baseAmount = item.mrp * item.quantity;
  const percentDiscount = (baseAmount * item.discountPercent) / 100;
  const implicitRateDiscount = Math.max(0, (item.mrp - item.unitCost) * item.quantity);
  return baseAmount - percentDiscount - item.discountAmount - implicitRateDiscount;
}

/** Net amount per unit after line-level discounts (for display / receipt rate). */
export function posLineNetUnitPrice(item: PosCartItem): number {
  return item.quantity > 0 ? item.netAmount / item.quantity : item.unitCost;
}

/** Recompute line net, then Sale GST % from post-discount unit price vs threshold. */
export function applyPosGarmentGstToItem(
  item: PosCartItem,
  garmentGstSettings: GarmentGstRuleSettings | null | undefined,
): PosCartItem {
  const netAmount = calculatePosCartLineNet(item);
  const withNet = { ...item, netAmount };
  const effectiveUnit = posLineNetUnitPrice(withNet);
  const purchaseGst = item.purchaseGstPer ?? item.gstPer;
  const resolvedGst = resolveGarmentGstForLine(
    effectiveUnit,
    purchaseGst,
    item.gstPer,
    garmentGstSettings,
  );
  // The garment/apparel GST-by-price-threshold rule has two independent
  // directions: bump UP to 18% when price crosses the org's threshold, or
  // force DOWN to the slab rate when price is at/below threshold but GST is
  // already 18% (normally from an inherited purchase rate). Only the DOWNWARD
  // direction is wrong for service line items — that was silently reverting a
  // manually-chosen 18% on a low-priced service (not a garment) back to 5%.
  // The UPWARD bump must still apply to services too: some orgs track
  // garment-equivalent items (e.g. custom-stitched suits, a boutique/tailor's
  // "SUITS" product) as service products and rely on this rule to auto-bump
  // them once price crosses the threshold, same as any other garment.
  const currentGst = Number(item.gstPer) || 0;
  const isDownwardCorrection = resolvedGst < currentGst;
  const gstPer = item.productType === "service" && isDownwardCorrection ? item.gstPer : resolvedGst;
  return { ...withNet, gstPer };
}

export function sumLineDiscount(rows: PosCartItem[]): number {
  return rows.reduce((sum, item) => {
    if (item.categoryTierApplied) {
      const qty = Number(item.quantity) || 0;
      const schemeLine = (Number(item.unitCost) || 0) * qty;
      const extra = extraDiscountOnSchemeLine(item, schemeLine);
      const implicitRateDiscount = Math.max(
        0,
        ((Number(item.mrp) || 0) - (Number(item.unitCost) || 0)) * qty,
      );
      return sum + extra + implicitRateDiscount;
    }
    const baseAmount = (Number(item.mrp) || 0) * (Number(item.quantity) || 0);
    const percentDiscount = (baseAmount * (Number(item.discountPercent) || 0)) / 100;
    const implicitRateDiscount = Math.max(
      0,
      ((Number(item.mrp) || 0) - (Number(item.unitCost) || 0)) * (Number(item.quantity) || 0),
    );
    return sum + percentDiscount + (Number(item.discountAmount) || 0) + implicitRateDiscount;
  }, 0);
}

export function sumMrpTotal(rows: PosCartItem[]): number {
  return rows.reduce((sum, item) => sum + (Number(item.mrp) || 0) * (Number(item.quantity) || 0), 0);
}

/** Whole numbers only — matches POSSales flat-discount controlled input. */
export function normalizeFlatDiscountInput(value: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.round(parsed);
}

const POS_PRICE_MATCH_EPSILON = 0.01;

export function posPricesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < POS_PRICE_MATCH_EPSILON;
}

/** Same SKU (variant) → one cart line. Shared EANs at different sale prices stay separate. */
export function findPosGoodsMergeIndex(items: PosCartItem[], variantId: string): number {
  const id = (variantId || "").trim();
  if (!id) return -1;
  return items.findIndex(
    (item) => item.productType !== "service" && item.variantId === id,
  );
}
export function findPosServiceMergeIndex(
  items: PosCartItem[],
  params: { barcode: string; variantId: string; mrp: number; unitCost: number },
): number {
  const code = (params.barcode || "").trim();
  if (!code || !params.variantId) return -1;
  return items.findIndex(
    (item) =>
      item.productType === "service" &&
      (item.barcode || "").trim() === code &&
      item.variantId === params.variantId &&
      posPricesMatch(item.mrp, params.mrp) &&
      posPricesMatch(item.unitCost, params.unitCost),
  );
}
