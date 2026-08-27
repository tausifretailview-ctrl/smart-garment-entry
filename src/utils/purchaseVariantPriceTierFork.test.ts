import { describe, expect, it } from "vitest";
import {
  importPriceTierKey,
  purchasePriceTierValue,
  purchasePriceTiersMatch,
} from "@/utils/purchaseVariantPriceTierFork";

describe("purchasePriceTiersMatch", () => {
  it("matches sale-only tiers within tolerance (SEMME 729 vs 729.00)", () => {
    expect(
      purchasePriceTiersMatch(
        { mrp: 0, salePrice: 729 },
        { mrp: 0, salePrice: 729 },
      ),
    ).toBe(true);
  });

  it("detects Jockey BRA tiers 729 vs 749 when MRP feature is off", () => {
    expect(
      purchasePriceTiersMatch(
        { mrp: 0, salePrice: 729 },
        { mrp: 0, salePrice: 749 },
      ),
    ).toBe(false);
  });

  it("uses MRP as tier key when set", () => {
    expect(purchasePriceTierValue({ mrp: 578, salePrice: 549 })).toBe(578);
    expect(importPriceTierKey(0, 549)).toBe("549.00");
  });
});
