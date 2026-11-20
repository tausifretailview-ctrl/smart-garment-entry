import { describe, expect, it } from "vitest";
import {
  clampMarkdownPercent,
  combinedDiscountPercent,
  markdownLineAmounts,
  normalizeBrandKey,
  parseProductMarkdownInput,
  resolveMarkdownPercent,
  splitMarkdownFromSavedLine,
} from "./markdown";

describe("markdown % (sale price 1800, brand markdown 25%)", () => {
  const brands = new Map([["ACME", 25], ["ZARA KIDS", 30]]);

  it("product markdown wins; empty follows the brand (any case / spaces)", () => {
    expect(resolveMarkdownPercent({ productMarkdown: null, brand: " acme ", brandMarkdowns: brands })).toBe(25);
    expect(resolveMarkdownPercent({ productMarkdown: undefined, brand: "Zara  Kids", brandMarkdowns: brands })).toBe(30);
    expect(resolveMarkdownPercent({ productMarkdown: 20, brand: "ACME", brandMarkdowns: brands })).toBe(20);
    expect(resolveMarkdownPercent({ productMarkdown: 0, brand: "ACME", brandMarkdowns: brands })).toBe(0);
    expect(resolveMarkdownPercent({ productMarkdown: null, brand: "OTHER", brandMarkdowns: brands })).toBe(0);
    expect(normalizeBrandKey("  zara   kids ")).toBe("ZARA KIDS");
  });

  it("parses and clamps input", () => {
    expect(parseProductMarkdownInput("")).toBeNull();
    expect(parseProductMarkdownInput(" 25 ")).toBe(25);
    expect(parseProductMarkdownInput("150")).toBe(99.99);
    expect(clampMarkdownPercent(-3)).toBe(0);
    expect(clampMarkdownPercent("abc")).toBe(0);
  });

  it("line money: 1800 → 1350 after 25% → 1282.50 after 5% extra", () => {
    expect(markdownLineAmounts({ base: 1800, markdownPercent: 25, discountPercent: 0, discountAmount: 0 })).toEqual({
      markdownAmount: 450, afterMarkdown: 1350, extraDiscountAmount: 0, afterDiscount: 1350,
    });
    expect(markdownLineAmounts({ base: 1800, markdownPercent: 25, discountPercent: 5, discountAmount: 0 }).afterDiscount).toBe(1282.5);
    expect(markdownLineAmounts({ base: 3600, markdownPercent: 25, discountPercent: 0, discountAmount: 100 }).afterDiscount).toBe(2600);
    expect(markdownLineAmounts({ base: 1800, markdownPercent: 0, discountPercent: 10, discountAmount: 0 }).afterDiscount).toBe(1620);
  });

  it("whole-line discount for reports, and split back when the bill is opened", () => {
    const pct = combinedDiscountPercent({ base: 1800, markdownPercent: 25, discountPercent: 5, discountAmount: 0 });
    expect(pct).toBe(28.75);
    expect(splitMarkdownFromSavedLine({ discountPercent: pct, discountAmount: 0 }, 25, 1800)).toEqual({
      markdownPercent: 25, discountPercent: 5, discountAmount: 0,
    });
    expect(combinedDiscountPercent({ base: 1800, markdownPercent: 25, discountPercent: 0, discountAmount: 0 })).toBe(25);
    expect(splitMarkdownFromSavedLine({ discountPercent: 25, discountAmount: 0 }, 25, 1800)).toEqual({
      markdownPercent: 25, discountPercent: 0, discountAmount: 0,
    });
    // ₹100 extra on 2 × 1800: whole discount 1000 of 3600 = 27.7778%.
    const rupee = combinedDiscountPercent({ base: 3600, markdownPercent: 25, discountPercent: 0, discountAmount: 100 });
    expect(rupee).toBeCloseTo(27.7778, 4);
    const back = splitMarkdownFromSavedLine({ discountPercent: rupee, discountAmount: 0 }, 25, 3600);
    expect(markdownLineAmounts({ base: 3600, ...back }).afterDiscount).toBeCloseTo(2600, 1);
    // No markdown: untouched.
    expect(splitMarkdownFromSavedLine({ discountPercent: 10, discountAmount: 0 }, null, 1800)).toEqual({
      markdownPercent: 0, discountPercent: 10, discountAmount: 0,
    });
  });
});
