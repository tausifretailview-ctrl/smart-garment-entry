import { describe, expect, it } from "vitest";
import {
  isPosFastBillingEnabled,
  isPosFastBillingQuickCodeTerm,
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
    expect(posFastBillingUsesDropdownPick("Jeans", false)).toBe(false);
  });
});
