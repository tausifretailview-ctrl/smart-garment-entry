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

export function normalizeCategoryKey(category: string | null | undefined): string {
  return String(category ?? "")
    .trim()
    .toLowerCase();
}

/** Bill total for qty using bundle + remainder rule (e.g. 5 @ 4-for-999 + 1 single). */
export function computeCategoryTierBillTotal(
  totalQty: number,
  rule: Pick<CategoryTierRule, "singleUnitPrice" | "tierQty" | "tierTotalPrice">,
): number {
  const qty = Math.max(0, Math.floor(Number(totalQty) || 0));
  if (qty <= 0) return 0;
  const tierQty = Math.max(2, Math.floor(Number(rule.tierQty) || 0));
  const bundles = Math.floor(qty / tierQty);
  const remainder = qty % tierQty;
  const single = Math.max(0, Number(rule.singleUnitPrice) || 0);
  const tierTotal = Math.max(0, Number(rule.tierTotalPrice) || 0);
  return Math.round((bundles * tierTotal + remainder * single) * 100) / 100;
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

function buildActiveRuleMap(rules: CategoryTierRule[]): Map<string, CategoryTierRule> {
  const map = new Map<string, CategoryTierRule>();
  for (const rule of rules) {
    if (rule.isActive === false) continue;
    const key = normalizeCategoryKey(rule.category);
    if (!key) continue;
    map.set(key, rule);
  }
  return map;
}

/** Resolve which tier rule category key applies to a cart line. */
export function resolveCartItemCategoryKey(
  item: PosCartItem,
  ruleMap: Map<string, CategoryTierRule>,
): string | null {
  const direct = normalizeCategoryKey(item.category);
  if (direct && ruleMap.has(direct)) return direct;

  const productName = String(item.productName ?? "").trim();
  if (productName) {
    const segments = productName.split("-").map((s) => s.trim()).filter(Boolean);
    for (const segment of segments.slice(1)) {
      const key = normalizeCategoryKey(segment);
      if (key && ruleMap.has(key)) return key;
    }
    for (const [key] of ruleMap) {
      if (productName.toLowerCase().includes(key)) return key;
    }
  }

  const baseName = String(item.baseProductName ?? "").trim();
  if (baseName) {
    for (const [key] of ruleMap) {
      if (baseName.toLowerCase().includes(key)) return key;
    }
  }

  return null;
}

/**
 * Re-price cart lines under category tier rules.
 * Tier pricing wins over MRP-mode / brand line discounts on affected categories.
 */
export function applyCategoryTierPricingToCart(
  items: PosCartItem[],
  rules: CategoryTierRule[],
  garmentGstSettings: GarmentGstRuleSettings | null | undefined,
): PosCartItem[] {
  const ruleMap = buildActiveRuleMap(rules);
  if (ruleMap.size === 0) return items;

  const groups = new Map<string, number[]>();
  items.forEach((item, index) => {
    const key = resolveCartItemCategoryKey(item, ruleMap);
    if (!key) return;
    const list = groups.get(key) ?? [];
    list.push(index);
    groups.set(key, list);
  });

  if (groups.size === 0) return items;

  const next = items.map((item) => ({ ...item }));

  for (const [categoryKey, indices] of groups) {
    const rule = ruleMap.get(categoryKey)!;
    const lineQtys = indices.map((i) => next[i].quantity);
    const totalQty = lineQtys.reduce((s, q) => s + q, 0);
    const categoryTotal = computeCategoryTierBillTotal(totalQty, rule);
    const lineTotals = allocateCategoryTierLineTotals(lineQtys, categoryTotal);

    indices.forEach((itemIndex, groupIndex) => {
      const item = next[itemIndex];
      const lineTotal = lineTotals[groupIndex];
      const perUnitNet = item.quantity > 0 ? lineTotal / item.quantity : 0;

      const repriced: PosCartItem = {
        ...item,
        category: item.category?.trim() || rule.category,
        discountPercent: 0,
        discountAmount: 0,
        unitCost: perUnitNet,
        rateAuthority: "discount",
        categoryTierApplied: true,
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
