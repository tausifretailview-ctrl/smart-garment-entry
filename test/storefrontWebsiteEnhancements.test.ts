import { describe, expect, it } from "vitest";
import { aggregateVariantRows, summarizeVariantSizeColor } from "@/lib/storefrontVariantSummary";
import { buildPublicStorefrontMenuTree } from "@/lib/websiteMenuTree";

describe("summarizeVariantSizeColor", () => {
  it("deduplicates sizes and colours", () => {
    const result = summarizeVariantSizeColor([
      { size: "M", color: "Red" },
      { size: "L", color: "Red" },
      { size: "M", color: "Blue" },
    ]);
    expect(result.sizes).toEqual(["M", "L"]);
    expect(result.colors).toEqual(["Red", "Blue"]);
    expect(result.sizesLabel).toBe("M, L");
    expect(result.colorsLabel).toBe("Red, Blue");
  });
});

describe("aggregateVariantRows", () => {
  it("groups by product id", () => {
    const map = aggregateVariantRows([
      { product_id: "p1", size: "38", color: "Black" },
      { product_id: "p1", size: "39", color: "Black" },
      { product_id: "p2", size: "Free", color: "White" },
    ]);
    expect(map.p1?.sizesLabel).toBe("38, 39");
    expect(map.p2?.colorsLabel).toBe("White");
  });
});

describe("buildPublicStorefrontMenuTree", () => {
  it("nests submenus under parents", () => {
    const tree = buildPublicStorefrontMenuTree([
      { id: "m1", parent_id: null, label: "Men", category_filter: "MEN", display_order: 1 },
      { id: "m2", parent_id: "m1", label: "Shirts", category_filter: "SHIRT", display_order: 1 },
    ]);
    expect(tree).toHaveLength(1);
    expect(tree[0].label).toBe("Men");
    expect(tree[0].children?.[0].label).toBe("Shirts");
  });
});
