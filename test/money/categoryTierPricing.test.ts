import { describe, expect, it } from "vitest";
import {
  allocateCategoryTierLineTotals,
  applyCategoryTierPricingToCart,
  categoryTierSchemeUnitPrice,
  computeCategoryTierBillTotal,
  isCategoryTierPricingEnabled,
  normalizeCategoryKey,
  resolveCartItemCategoryKey,
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
    unitCost: 299,
    netAmount: 299,
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

  it("computeCategoryTierBillTotal: qty 1 is Single; qty 2+ uses scheme rate on every piece", () => {
    expect(categoryTierSchemeUnitPrice(tShirtRule)).toBe(249.75);
    expect(computeCategoryTierBillTotal(1, tShirtRule)).toBe(299);
    expect(computeCategoryTierBillTotal(2, tShirtRule)).toBe(499.5);
    expect(computeCategoryTierBillTotal(3, tShirtRule)).toBe(749.25);
    expect(computeCategoryTierBillTotal(4, tShirtRule)).toBe(999);
    expect(computeCategoryTierBillTotal(5, tShirtRule)).toBe(1248.75);
    expect(computeCategoryTierBillTotal(8, tShirtRule)).toBe(1998);
  });

  it("allocateCategoryTierLineTotals splits by qty with penny on last line", () => {
    const totals = allocateCategoryTierLineTotals([2, 3], 1248.75);
    expect(totals.reduce((s, n) => s + n, 0)).toBe(1248.75);
    expect(totals[0]).toBeCloseTo(499.5, 1);
    expect(totals[1]).toBeCloseTo(749.25, 1);
  });

  it("applyCategoryTierPricingToCart reprices lines and clears line discounts", () => {
    const items = [
      makeItem({ id: "a", quantity: 2, discountPercent: 10 }),
      makeItem({ id: "b", quantity: 3, mrp: 449, unitCost: 299 }),
    ];
    const out = applyCategoryTierPricingToCart(items, [tShirtRule], null);
    expect(out[0].discountPercent).toBe(0);
    expect(out[0].categoryTierApplied).toBe(true);
    const sum = out.reduce((s, i) => s + i.netAmount, 0);
    expect(sum).toBe(1248.75);
  });

  it("applyCategoryTierPricingToCart skips categories without rules", () => {
    const items = [
      makeItem({
        category: "Jeans",
        productName: "Denim-Jeans",
        quantity: 2,
        unitCost: 900,
        netAmount: 1800,
      }),
    ];
    const out = applyCategoryTierPricingToCart(items, [tShirtRule], null);
    expect(out[0].netAmount).toBe(1800);
    expect(out[0].categoryTierApplied).toBeUndefined();
  });

  it("resolveCartItemCategoryKey matches productName segment when category empty", () => {
    const ruleMap = new Map([["t-shirt", tShirtRule]]);
    const key = resolveCartItemCategoryKey(
      makeItem({ category: null, productName: "TEE-T-Shirt-Brand-Red" }),
      ruleMap,
    );
    expect(key).toBe("t-shirt");
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
      makeItem({ id: "s1", category: "Shirt", quantity: 3, mrp: 599, unitCost: 449 }),
    ];
    const out = applyCategoryTierPricingToCart(items, [tShirtRule, shirtRule], null);
    expect(out[0].netAmount).toBe(999);
    expect(out[1].netAmount).toBe(1199);
  });

  const trackPants300 = {
    category: "Track Pants",
    singleUnitPrice: 300,
    tierQty: 4,
    tierTotalPrice: 1000,
    isActive: true,
  };

  function trackPant(id: string, unitCost: number, quantity = 1): PosCartItem {
    return makeItem({
      id,
      barcode: id,
      productName: "TRZ-Track Pants",
      category: "Track Pants",
      quantity,
      mrp: unitCost,
      originalMrp: unitCost,
      unitCost,
      netAmount: unitCost * quantity,
    });
  }

  it("Trenzo-style: 1@₹300, 2@₹500, 4@₹1000 (scheme rate ₹250 from qty 2)", () => {
    expect(computeCategoryTierBillTotal(1, trackPants300)).toBe(300);
    expect(computeCategoryTierBillTotal(2, trackPants300)).toBe(500);
    expect(computeCategoryTierBillTotal(3, trackPants300)).toBe(750);
    expect(computeCategoryTierBillTotal(4, trackPants300)).toBe(1000);
    expect(computeCategoryTierBillTotal(5, trackPants300)).toBe(1250);

    const qty2 = applyCategoryTierPricingToCart(
      [trackPant("a", 300, 2)],
      [trackPants300],
      null,
    );
    expect(qty2[0].netAmount).toBe(500);
    expect(qty2[0].unitCost).toBe(250);
    expect(qty2[0].discountPercent).toBe(0);
    expect(qty2[0].categoryTierApplied).toBe(true);
  });

  it("4 Track Pants @ ₹300 bundle to ₹1000", () => {
    const out = applyCategoryTierPricingToCart(
      [trackPant("a", 300, 4)],
      [trackPants300],
      null,
    );
    expect(out[0].netAmount).toBe(1000);
    expect(out[0].categoryTierApplied).toBe(true);
    expect(out[0].categoryTierListPrice).toBe(300);
  });

  it("two qty-1 Track Pants pool to ₹500 (same scheme as qty 2)", () => {
    const out = applyCategoryTierPricingToCart(
      [trackPant("a", 300, 1), trackPant("b", 300, 1)],
      [trackPants300],
      null,
    );
    expect(out.reduce((s, i) => s + i.netAmount, 0)).toBe(500);
    expect(out[0].categoryTierApplied).toBe(true);
    expect(out[1].categoryTierApplied).toBe(true);
  });

  it("3 @ ₹300 + 1 @ ₹600: ₹300s use scheme rate, ₹600 never joins the bundle", () => {
    const items = [
      trackPant("a", 300, 3),
      trackPant("b", 600, 1),
    ];
    const out = applyCategoryTierPricingToCart(items, [trackPants300], null);
    expect(out[0].netAmount).toBe(750);
    expect(out[0].categoryTierApplied).toBe(true);
    expect(out[1].netAmount).toBe(600);
    expect(out[1].categoryTierApplied).toBeUndefined();
  });

  it("4 @ ₹300 + 2 @ ₹600: only the ₹300s bundle; ₹600s bill separately", () => {
    const items = [
      trackPant("a", 300, 4),
      trackPant("b", 600, 2),
    ];
    const out = applyCategoryTierPricingToCart(items, [trackPants300], null);
    expect(out[0].netAmount).toBe(1000);
    expect(out[1].netAmount).toBe(1200);
    expect(out[1].categoryTierApplied).toBeUndefined();
    expect(out.reduce((s, i) => s + i.netAmount, 0)).toBe(2200);
  });

  it("does not apply a ₹299 rule to a ₹449 line in the same category", () => {
    const items = [makeItem({ id: "x", unitCost: 449, netAmount: 449, quantity: 4 })];
    const out = applyCategoryTierPricingToCart(items, [tShirtRule], null);
    expect(out[0].netAmount).toBe(449);
    expect(out[0].categoryTierApplied).toBeUndefined();
  });

  it("two rules in the same category stay independent by unit price", () => {
    const trackPants600 = {
      category: "Track Pants",
      singleUnitPrice: 600,
      tierQty: 2,
      tierTotalPrice: 1000,
      isActive: true,
    };
    const items = [trackPant("a", 300, 4), trackPant("b", 600, 2)];
    const out = applyCategoryTierPricingToCart(items, [trackPants300, trackPants600], null);
    expect(out[0].netAmount).toBe(1000);
    expect(out[1].netAmount).toBe(1000);
  });

  it("BAGGY TRACK @ ₹450 uses product-name rule 3 for ₹1200, not category TRACK", () => {
    const baggyTrackRule = {
      category: "baggy track",
      singleUnitPrice: 450,
      tierQty: 3,
      tierTotalPrice: 1200,
      isActive: true,
    };
    const trackRule = {
      category: "TRACK",
      singleUnitPrice: 450,
      tierQty: 4,
      tierTotalPrice: 1600,
      isActive: true,
    };
    const item = makeItem({
      id: "bt",
      productName: "BAGGY TRACK-TRACK-TB",
      baseProductName: "BAGGY TRACK",
      category: "TRACK",
      quantity: 3,
      mrp: 450,
      originalMrp: 450,
      unitCost: 450,
      netAmount: 1350,
    });
    const out = applyCategoryTierPricingToCart([item], [trackRule, baggyTrackRule], null);
    expect(out[0].netAmount).toBe(1200);
    expect(out[0].categoryTierApplied).toBe(true);
    expect(resolveCartItemCategoryKey(item, new Set(["track", "baggy track"]))).toBe("baggy track");
  });

  it("does not apply a BAGGY TRACK rule to another TRACK product at the same price", () => {
    const baggyTrackRule = {
      category: "baggy track",
      singleUnitPrice: 450,
      tierQty: 3,
      tierTotalPrice: 1200,
      isActive: true,
    };
    const otherTrack = makeItem({
      id: "ot",
      productName: "PLAIN TRACK-TRACK-TB",
      baseProductName: "PLAIN TRACK",
      category: "TRACK",
      quantity: 3,
      unitCost: 450,
      netAmount: 1350,
    });
    const out = applyCategoryTierPricingToCart([otherTrack], [baggyTrackRule], null);
    expect(out[0].netAmount).toBe(1350);
    expect(out[0].categoryTierApplied).toBeUndefined();
  });

  it("rematch after bundle reprice still uses the original ₹300 list price", () => {
    const first = applyCategoryTierPricingToCart([trackPant("a", 300, 4)], [trackPants300], null);
    expect(first[0].unitCost).toBe(250);
    const second = applyCategoryTierPricingToCart(first, [trackPants300], null);
    expect(second[0].netAmount).toBe(1000);
    expect(second[0].categoryTierListPrice).toBe(300);
  });
});
