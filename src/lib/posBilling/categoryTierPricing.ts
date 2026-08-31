import { applyPosGarmentGstToItem } from "./lineMath";
import type { PosCartItem } from "./types";
import type { GarmentGstRuleSettings } from "@/utils/gstRules";

export type CategoryTierRule = {
  category: string;
  singleUnitPrice: number;
  tierQty: number;
  tierTotalPrice: number;
  isActive?: boolean;
};

const PRICE_EPS = 0.005;

export function normalizeCategoryKey(category: string | null | undefined): string {
  return String(category ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * How well a scheme label matches a cart line.
 * Product name beats category so "BAGGY TRACK" is not stolen by category "TRACK".
 * Loose substring matching is not used — "track" must not win inside "baggy track".
 */
export function scoreTierRuleIdentity(ruleLabel: string, item: PosCartItem): number {
  const key = normalizeCategoryKey(ruleLabel);
  if (!key) return 0;

  const base = normalizeCategoryKey(item.baseProductName);
  const productName = normalizeCategoryKey(item.productName);
  const category = normalizeCategoryKey(item.category);
  const nameHead = productName.split("-")[0]?.trim() || "";

  if (key === base || key === nameHead) return 100 + key.length;
  if (productName === key || productName.startsWith(`${key}-`)) return 90 + key.length;
  if (key === category) return 50 + key.length;

  const segments = productName.split("-").map((s) => s.trim()).filter(Boolean);
  if (segments.slice(1).includes(key)) return 40 + key.length;
  // Hyphenated labels in the POS description (TEE-T-Shirt-Brand) — not loose
  // substring, so "track" does not match the words inside "baggy track".
  if (
    productName.includes(`-${key}-`) ||
    productName.endsWith(`-${key}`) ||
    productName.startsWith(`${key}-`)
  ) {
    return 45 + key.length;
  }
  return 0;
}

export function normalizeTierUnitPrice(price: number | null | undefined): number {
  return Math.round((Number(price) || 0) * 100) / 100;
}

export function pricesMatchForTier(
  a: number | null | undefined,
  b: number | null | undefined,
): boolean {
  return Math.abs(normalizeTierUnitPrice(a) - normalizeTierUnitPrice(b)) < PRICE_EPS;
}

export function categoryTierRuleKey(category: string, singleUnitPrice: number): string {
  return `${normalizeCategoryKey(category)}::${normalizeTierUnitPrice(singleUnitPrice).toFixed(2)}`;
}

/** Scheme rate per piece: bundle total ÷ bundle qty (e.g. ₹1000 / 4 = ₹250). */
export function categoryTierSchemeUnitPrice(
  rule: Pick<CategoryTierRule, "tierQty" | "tierTotalPrice">,
): number {
  const tierQty = Math.max(2, Math.floor(Number(rule.tierQty) || 0));
  const tierTotal = Math.max(0, Number(rule.tierTotalPrice) || 0);
  return tierQty > 0 ? tierTotal / tierQty : 0;
}

/**
 * Bill total for a scheme product.
 * Qty 1 stays at Single (₹). Qty 2+ uses the scheme rate on every piece
 * so 1@₹300 / 4@₹1000 bills qty 2 at ₹500 (not 2×₹300).
 * Full bundles stay exact: 4→₹1000, 8→₹2000.
 */
export function computeCategoryTierBillTotal(
  totalQty: number,
  rule: Pick<CategoryTierRule, "singleUnitPrice" | "tierQty" | "tierTotalPrice">,
): number {
  const qty = Math.max(0, Math.floor(Number(totalQty) || 0));
  if (qty <= 0) return 0;
  const single = Math.max(0, Number(rule.singleUnitPrice) || 0);
  if (qty === 1) return Math.round(single * 100) / 100;
  const schemeUnit = categoryTierSchemeUnitPrice(rule);
  return Math.round(qty * schemeUnit * 100) / 100;
}

/** Split category total across lines by quantity (last line absorbs rounding). */
export function allocateCategoryTierLineTotals(
  lineQtys: number[],
  categoryTotal: number,
): number[] {
  if (lineQtys.length === 0) return [];
  const totalQty = lineQtys.reduce((s, q) => s + q, 0);
  if (totalQty <= 0) return lineQtys.map(() => 0);

  const target = Math.round(categoryTotal * 100) / 100;
  const out: number[] = [];
  let allocated = 0;
  for (let i = 0; i < lineQtys.length; i++) {
    if (i === lineQtys.length - 1) {
      out.push(Math.round((target - allocated) * 100) / 100);
    } else {
      const share = Math.round(((lineQtys[i] / totalQty) * target) * 100) / 100;
      out.push(share);
      allocated += share;
    }
  }
  return out;
}

function categoryKeySetFromMapOrSet(
  categoryKeys: Map<string, unknown> | Set<string>,
): Set<string> {
  return categoryKeys instanceof Set ? categoryKeys : new Set(categoryKeys.keys());
}

/** Resolve which tier rule label applies to a cart line (price is applied separately). */
export function resolveCartItemCategoryKey(
  item: PosCartItem,
  categoryKeys: Map<string, unknown> | Set<string>,
): string | null {
  const keys = categoryKeySetFromMapOrSet(categoryKeys);
  let bestKey: string | null = null;
  let bestScore = 0;
  for (const key of keys) {
    const score = scoreTierRuleIdentity(key, item);
    if (score > bestScore) {
      bestScore = score;
      bestKey = key;
    }
  }
  return bestScore > 0 ? bestKey : null;
}

/**
 * Unit price used to match a rule. After a bundle apply, `unitCost` is the
 * allocated rate — rematch must use the stored list price instead.
 */
export function cartLineUnitPriceForTier(item: PosCartItem): number {
  const listed = Number(item.categoryTierListPrice);
  if (item.categoryTierApplied && listed > PRICE_EPS) {
    return listed;
  }
  return Number(item.unitCost) || 0;
}

export function findMatchingCategoryTierRule(
  item: PosCartItem,
  rules: CategoryTierRule[],
): CategoryTierRule | null {
  const price = cartLineUnitPriceForTier(item);
  let best: { rule: CategoryTierRule; score: number } | null = null;
  for (const rule of rules) {
    if (rule.isActive === false) continue;
    if (!pricesMatchForTier(rule.singleUnitPrice, price)) continue;
    const score = scoreTierRuleIdentity(rule.category, item);
    if (score > (best?.score ?? 0)) best = { rule, score };
  }
  return best?.rule ?? null;
}

/**
 * Re-price cart lines under category + unit-price tier rules.
 * A ₹600 Track Pant never pools with a ₹300 Track Pant bundle.
 * Tier pricing wins over MRP-mode / brand line discounts on matched lines.
 */
export function applyCategoryTierPricingToCart(
  items: PosCartItem[],
  rules: CategoryTierRule[],
  garmentGstSettings: GarmentGstRuleSettings | null | undefined,
): PosCartItem[] {
  const activeRules = rules.filter((rule) => rule.isActive !== false);
  if (activeRules.length === 0) return items;

  const groups = new Map<string, { rule: CategoryTierRule; indices: number[] }>();
  items.forEach((item, index) => {
    const rule = findMatchingCategoryTierRule(item, activeRules);
    if (!rule) return;
    const key = categoryTierRuleKey(rule.category, rule.singleUnitPrice);
    const group = groups.get(key);
    if (group) group.indices.push(index);
    else groups.set(key, { rule, indices: [index] });
  });

  if (groups.size === 0) return items;

  const next = items.map((item) => ({ ...item }));

  for (const { rule, indices } of groups.values()) {
    const lineQtys = indices.map((i) => next[i].quantity);
    const totalQty = lineQtys.reduce((s, q) => s + q, 0);
    const categoryTotal = computeCategoryTierBillTotal(totalQty, rule);
    const lineTotals = allocateCategoryTierLineTotals(lineQtys, categoryTotal);

    indices.forEach((itemIndex, groupIndex) => {
      const item = next[itemIndex];
      const lineTotal = lineTotals[groupIndex];
      const perUnitNet = item.quantity > 0 ? lineTotal / item.quantity : 0;
      const listPrice = cartLineUnitPriceForTier(item);

      const repriced: PosCartItem = {
        ...item,
        category: item.category?.trim() || rule.category,
        discountPercent: 0,
        discountAmount: 0,
        unitCost: perUnitNet,
        rateAuthority: "discount",
        categoryTierApplied: true,
        categoryTierListPrice: listPrice,
        netAmount: lineTotal,
      };
      next[itemIndex] = applyPosGarmentGstToItem(
        { ...repriced, netAmount: lineTotal },
        garmentGstSettings,
      );
      next[itemIndex].netAmount = lineTotal;
    });
  }

  return next;
}

export function isCategoryTierPricingEnabled(
  saleSettings?: { pos_category_tier_pricing?: boolean | null } | null,
): boolean {
  return saleSettings?.pos_category_tier_pricing === true;
}
