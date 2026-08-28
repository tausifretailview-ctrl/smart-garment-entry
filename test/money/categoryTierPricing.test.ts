import { describe, expect, it } from "vitest";
import {
  allocateCategoryTierLineTotals,
  applyCategoryTierPricingToCart,
  computeCategoryTierBillTotal,
  isCategoryTierPricingEnabled,
  normalizeCategoryKey,
} from "@/lib/posBilling/categoryTierPricing";
import type { PosCartItem } from "@/lib/posBilling/types";

const tShirtRule = {
  category: "T-Shirt",
  singleUnitPrice: 299,
  tierQty: 4,
  tierTotalPrice: 999,
  isActive: true,
};

function makeItem(overrides: Partial<PosCartItem>): PosCartItem {
  return {
    id: "1",
    barcode: "001",
    productName: "TEE-T-Shirt",
    category: "T-Shirt",
    size: "M",
    color: "Red",
    quantity: 1,
    mrp: 449,
    originalMrp: 449,
    gstPer: 5,
    discountPercent: 0,
    discountAmount: 0,
    unitCost: 449,
    netAmount: 449,
    productId: "p1",
    variantId: "v1",
    ...overrides,
  };
}

describe("categoryTierPricing", () => {
  it("normalizeCategoryKey trims and lowercases", () => {
    expect(normalizeCategoryKey("  T-Shirt ")).toBe("t-shirt");
  });

  it("isCategoryTierPricingEnabled respects sale_settings flag", () => {
    expect(isCategoryTierPricingEnabled({ pos_category_tier_pricing: true })).toBe(true);
    expect(isCategoryTierPricingEnabled({ pos_category_tier_pricing: false })).toBe(false);
    expect(isCategoryTierPricingEnabled(null)).toBe(false);
  });

  it("computeCategoryTierBillTotal: 5 items = 4 bundle + 1 single", () => {
    expect(computeCategoryTierBillTotal(5, tShirtRule)).toBe(1298);
    expect(computeCategoryTierBillTotal(4, tShirtRule)).toBe(999);
    expect(computeCategoryTierBillTotal(3, tShirtRule)).toBe(897);
    expect(computeCategoryTierBillTotal(8, tShirtRule)).toBe(1998);
  });

  it("allocateCategoryTierLineTotals splits by qty with penny on last line", () => {
    const totals = allocateCategoryTierLineTotals([2, 3], 1298);
    expect(totals.reduce((s, n) => s + n, 0)).toBe(1298);
    expect(totals[0]).toBeCloseTo(519.2, 1);
    expect(totals[1]).toBeCloseTo(778.8, 1);
  });

  it("applyCategoryTierPricingToCart reprices lines and clears line discounts", () => {
    const items = [
      makeItem({ id: "a", quantity: 2, discountPercent: 10 }),
      makeItem({ id: "b", quantity: 3, mrp: 449, unitCost: 449 }),
    ];
    const out = applyCategoryTierPricingToCart(items, [tShirtRule], null);
    expect(out[0].discountPercent).toBe(0);
    expect(out[0].categoryTierApplied).toBe(true);
    const sum = out.reduce((s, i) => s + i.netAmount, 0);
    expect(sum).toBe(1298);
  });

  it("applyCategoryTierPricingToCart skips categories without rules", () => {
    const items = [makeItem({ category: "Jeans", quantity: 2, unitCost: 900, netAmount: 1800 })];
    const out = applyCategoryTierPricingToCart(items, [tShirtRule], null);
    expect(out[0].netAmount).toBe(1800);
    expect(out[0].categoryTierApplied).toBeUndefined();
  });

  it("categories are independent", () => {
    const shirtRule = {
      category: "Shirt",
      singleUnitPrice: 449,
      tierQty: 3,
      tierTotalPrice: 1199,
      isActive: true,
    };
    const items = [
      makeItem({ id: "t1", category: "T-Shirt", quantity: 4 }),
      makeItem({ id: "s1", category: "Shirt", quantity: 3, mrp: 599, unitCost: 599 }),
    ];
    const out = applyCategoryTierPricingToCart(items, [tShirtRule, shirtRule], null);
    expect(out[0].netAmount).toBe(999);
    expect(out[1].netAmount).toBe(1199);
  });
});
