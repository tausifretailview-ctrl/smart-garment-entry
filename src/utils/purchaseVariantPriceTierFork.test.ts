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

  it("uses MRP as tier value from purchasePriceTierValue (display/legacy scalar, unchanged)", () => {
    expect(purchasePriceTierValue({ mrp: 578, salePrice: 549 })).toBe(578);
    // importPriceTierKey now returns a compound mrp|salePrice key, not a bare
    // decimal string — assert on determinism/uniqueness, not the exact format.
    expect(importPriceTierKey(0, 549)).toBe(importPriceTierKey(0, 549));
    expect(importPriceTierKey(0, 549)).not.toBe(importPriceTierKey(0, 569));
  });

  it("detects a sale-price change even when MRP is populated and unchanged (the real JOCKEY BRA bug: mrp stuck at 200, sale_price moved 400 -> 500)", () => {
    expect(
      purchasePriceTiersMatch(
        { mrp: 200, salePrice: 400 },
        { mrp: 200, salePrice: 500 },
      ),
    ).toBe(false);
  });

  it("still matches when both MRP and sale price are genuinely unchanged", () => {
    expect(
      purchasePriceTiersMatch(
        { mrp: 200, salePrice: 400 },
        { mrp: 200, salePrice: 400 },
      ),
    ).toBe(true);
  });
});
