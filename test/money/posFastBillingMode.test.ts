import { describe, expect, it } from "vitest";
import {
  expandFastBillingCompoundSearchTerm,
  isPosFastBillingEnabled,
  isPosFastBillingQuickCodeTerm,
  posFastBillingMetaLabel,
  posFastBillingUsesDropdownPick,
} from "@/utils/posFastBillingMode";

describe("posFastBillingMode", () => {
  it("detects enabled setting", () => {
    expect(isPosFastBillingEnabled({ pos_quick_price_code: true })).toBe(true);
    expect(isPosFastBillingEnabled({ pos_quick_price_code: false })).toBe(false);
    expect(isPosFastBillingEnabled(null)).toBe(false);
  });

  it("recognises quick codes", () => {
    expect(isPosFastBillingQuickCodeTerm("J900")).toBe(true);
    expect(isPosFastBillingQuickCodeTerm("Jeans")).toBe(false);
  });

  it("uses dropdown pick for name search only when fast billing is on", () => {
    expect(posFastBillingUsesDropdownPick("Jeans", true)).toBe(true);
    expect(posFastBillingUsesDropdownPick("J900", true)).toBe(false);
    expect(posFastBillingUsesDropdownPick("1234567890123", true)).toBe(false);
    expect(posFastBillingUsesDropdownPick("BHG215", true)).toBe(false);
    expect(posFastBillingUsesDropdownPick("Bootcut", true)).toBe(true);
    expect(posFastBillingUsesDropdownPick("Jeans", false)).toBe(false);
  });

  it("splits brand+name compound typing for dropdown search", () => {
    expect(expandFastBillingCompoundSearchTerm("TBJEANS")).toBe("tb jeans");
    expect(expandFastBillingCompoundSearchTerm("Jeans")).toBe("Jeans");
    expect(expandFastBillingCompoundSearchTerm("J900")).toBe("J900");
    expect(expandFastBillingCompoundSearchTerm("tb jeans")).toBe("tb jeans");
  });

  it("formats brand and category for fast billing dropdown rows", () => {
    expect(
      posFastBillingMetaLabel({ product_name: "BOOTCUT", brand: "TB", category: "Jeans" }),
    ).toBe("TB · Jeans");
    expect(
      posFastBillingMetaLabel({ product_name: "BOOTCUT JEANS", brand: "TB", category: "Jeans" }),
    ).toBe("TB");
    expect(posFastBillingMetaLabel({ product_name: "SHIRT", brand: "", category: "Formal" })).toBe(
      "Formal",
    );
  });
});
