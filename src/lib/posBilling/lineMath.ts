import {
  getGarmentSlabPrice,
  isGarmentGstRuleEnabled,
  resolveGarmentGstForLine,
  type GarmentGstRuleSettings,
} from "@/utils/gstRules";
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
  // Same sale-price slab as goods when the org setting is on: above threshold
  // → 18%, at/below → configured slab (e.g. 5%). Services use the price entered
  // at POS / sale time, so they must follow this too — not keep a master 18%.
  // Re-judging the line ends a hand-picked GST, as it always has for line edits.
  const updated: PosCartItem = { ...withNet, gstPer: resolvedGst };
  delete updated.gstManual;
  return updated;
}

/**
 * Bill-wide garment GST pass: re-judge each line's slab on its per-piece price
 * after the bill (flat) discount share, in the threshold's incl. GST basis.
 * Line mutators judge one line without the flat discount; this pass runs after
 * them. It only touches lines while a flat discount is on or the bill is
 * exclusive (plus lines it changed before, so removing the discount restores
 * them), and never a line whose GST the cashier picked by hand.
 * Returns the same array when nothing changes.
 */
export function applyPosGarmentGstForBill(
  items: PosCartItem[],
  garmentGstSettings: GarmentGstRuleSettings | null | undefined,
  opts: { flatDiscountAmount: number; taxType: string },
): PosCartItem[] {
  if (!isGarmentGstRuleEnabled(garmentGstSettings)) return items;
  const subtotal = items.reduce((sum, item) => sum + (Number(item.netAmount) || 0), 0);
  const flat = Math.max(0, Number(opts.flatDiscountAmount) || 0);
  // Same proportional split as computePosBillGst: each line loses flat/subtotal of its net.
  const billDiscountRatio = subtotal > 0.005 ? Math.min(1, flat / subtotal) : 0;
  const priceIncludesGst = opts.taxType !== "exclusive";
  const active = billDiscountRatio > 0 || !priceIncludesGst;

  let changed = false;
  const next = items.map((item) => {
    if (item.gstManual) return item;
    if (!active && !item.billSlabApplied) return item;
    const slabPrice = getGarmentSlabPrice(
      posLineNetUnitPrice(item),
      { billDiscountRatio, priceIncludesGst },
      garmentGstSettings,
    );
    const gstPer = resolveGarmentGstForLine(
      slabPrice,
      item.purchaseGstPer ?? item.gstPer,
      item.gstPer,
      garmentGstSettings,
    );
    if (gstPer === item.gstPer && !!item.billSlabApplied === active) return item;
    changed = true;
    const updated: PosCartItem = { ...item, gstPer };
    if (active) updated.billSlabApplied = true;
    else delete updated.billSlabApplied;
    return updated;
  });
  return changed ? next : items;
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

/**
 * Cart-only key of a price picked at scan (price window / last-purchase / qty dialog).
 * "" = master price. Same SKU at a different picked MRP / sale price is its own line.
 */
export function posPickedPriceKey(overridePrice?: { sale_price?: number | null; mrp?: number | null } | null): string {
  if (!overridePrice) return "";
  const r = (v: number | null | undefined) => (Math.round((Number(v) || 0) * 100) / 100).toFixed(2);
  return `${r(overridePrice.sale_price)}|${r(overridePrice.mrp)}`;
}

/**
 * Same SKU (variant) at the same picked price → one cart line. Shared EANs at
 * different sale prices stay separate, and so does one SKU scanned at two MRPs.
 */
export function findPosGoodsMergeIndex(items: PosCartItem[], variantId: string, pickedPriceKey = ""): number {
  const id = (variantId || "").trim();
  if (!id) return -1;
  return items.findIndex(
    (item) =>
      item.productType !== "service" &&
      item.variantId === id &&
      (item.pickedPriceKey ?? "") === pickedPriceKey,
  );
}

/** Units of this SKU already in the cart, over all its lines (for the stock check). */
export function posCartQtyForVariant(items: PosCartItem[], variantId: string): number {
  return items
    .filter((item) => item.productType !== "service" && item.variantId === variantId)
    .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
}
export function findPosServiceMergeIndex(
  items: PosCartItem[],
  params: { barcode: string; variantId: string; mrp: number; unitCost: number; itemNotes?: string | null },
): number {
  const code = (params.barcode || "").trim();
  if (!code || !params.variantId) return -1;
  // A line with a cashier-typed description (design no, brand…) is its own line:
  // merging would silently drop the second description.
  const notes = (params.itemNotes || "").trim();
  return items.findIndex(
    (item) =>
      item.productType === "service" &&
      (item.barcode || "").trim() === code &&
      item.variantId === params.variantId &&
      posPricesMatch(item.mrp, params.mrp) &&
      posPricesMatch(item.unitCost, params.unitCost) &&
      (item.itemNotes || "").trim() === notes,
  );
}
