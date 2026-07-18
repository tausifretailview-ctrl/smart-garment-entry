import { describe, expect, it } from "vitest";
import {
  findExactBrandDiscount,
  normalizeBrand,
  resolveBrandDiscountForProduct,
} from "./customerBrandDiscountLookup";

const discounts = [
  { brand: "A WALK", discount_percent: 0 },
  { brand: "PUMA", discount_percent: 7 },
  { brand: "RLX", discount_percent: 5 },
  { brand: "WALK", discount_percent: 7 },
];

describe("normalizeBrand", () => {
  it("trims, lowercases, and collapses whitespace", () => {
    expect(normalizeBrand("  A  WALK ")).toBe("a walk");
  });
});

describe("findExactBrandDiscount", () => {
  it("returns 0 for an intentional zero-percent brand row", () => {
    expect(findExactBrandDiscount(discounts, "A WALK")).toBe(0);
  });

  it("returns null when brand has no row", () => {
    expect(findExactBrandDiscount(discounts, "NIKE")).toBeNull();
  });
});

describe("resolveBrandDiscountForProduct", () => {
  it("honors exact brand match at 0% and does not fall through to name tokens", () => {
    // Product name contains WALK (another brand at 7%) — must stay 0.
    expect(
      resolveBrandDiscountForProduct(
        discounts,
        "A WALK",
        "RR57-IN.BLUE-A WALK-LD",
      ),
    ).toBe(0);
  });

  it("falls back to product-name token when brand has no row", () => {
    expect(
      resolveBrandDiscountForProduct(discounts, null, "PUG-RLX-KIDS"),
    ).toBe(5);
  });

  it("skips single-character tokens like A", () => {
    // Without min-length, "A" could falsely match a brand named "A".
    const withA = [...discounts, { brand: "A", discount_percent: 7 }];
    expect(
      resolveBrandDiscountForProduct(
        withA,
        "UNKNOWN",
        "RR57-IN.BLUE-A WALK-LD",
      ),
    ).toBe(7); // WALK still matches at 7% after skipping "A"
  });

  it("returns 0 when neither brand nor tokens match", () => {
    expect(
      resolveBrandDiscountForProduct(discounts, "NIKE", "RANDOM-PRODUCT"),
    ).toBe(0);
  });

  it("token match at 0% stops later higher rates", () => {
    const rows = [
      { brand: "WALK", discount_percent: 0 },
      { brand: "LD", discount_percent: 7 },
    ];
    expect(
      resolveBrandDiscountForProduct(rows, null, "BLUE-A WALK-LD"),
    ).toBe(0);
  });
});
