import { describe, expect, it } from "vitest";
import {
  isPurchaseBarcodeLikeSearch,
  purchaseItemTextSearchOr,
} from "./purchaseBillDashboardSearch";

describe("purchase item search shape", () => {
  it("treats 4+ digits as barcode-like (exact then prefix)", () => {
    expect(isPurchaseBarcodeLikeSearch("4500")).toBe(true);
    expect(isPurchaseBarcodeLikeSearch("8901234567890")).toBe(true);
    expect(isPurchaseBarcodeLikeSearch("205")).toBe(false);
    expect(isPurchaseBarcodeLikeSearch("JEANS")).toBe(false);
    expect(isPurchaseBarcodeLikeSearch("FL20")).toBe(false);
  });

  it("keeps 6-field contains for product text", () => {
    const or = purchaseItemTextSearchOr("JEANS");
    expect(or).toContain("product_name.ilike.%JEANS%");
    expect(or).toContain("barcode.ilike.%JEANS%");
    expect(or).toContain("brand.ilike.%JEANS%");
  });
});
