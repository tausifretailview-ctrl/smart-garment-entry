import { describe, expect, it } from "vitest";
import {
  clampQty,
  formatQtyForDisplay,
  isPartialQtyInput,
  parseQtyValue,
} from "@/utils/qtyInput";

describe("qtyInput", () => {
  it("treats leading-dot decimals as partial while typing", () => {
    expect(isPartialQtyInput(".", "MTR")).toBe(true);
    expect(isPartialQtyInput(".0", "KG")).toBe(true);
    expect(isPartialQtyInput("0.", "MTR")).toBe(true);
  });

  it("accepts completed decimal qty values", () => {
    expect(isPartialQtyInput(".001", "MTR")).toBe(false);
    expect(parseQtyValue(".001", "MTR")).toBe(0.001);
    expect(parseQtyValue("2.5", "KG")).toBe(2.5);
  });

  it("rounds decimal qty to 3 places", () => {
    expect(parseQtyValue("1.23456", "MTR")).toBe(1.235);
  });

  it("formats decimal qty without trailing zeros", () => {
    expect(formatQtyForDisplay(2.5, "KG")).toBe("2.5");
    expect(formatQtyForDisplay(0.001, "MTR")).toBe("0.001");
  });

  it("clamps decimal qty to minimum 0.001", () => {
    expect(clampQty(0, "MTR")).toBe(0.001);
    expect(clampQty(0.0005, "KG")).toBe(0.001);
  });

  it("keeps integer qty for piece units", () => {
    expect(parseQtyValue("12", "NOS")).toBe(12);
    expect(isPartialQtyInput("0", "NOS")).toBe(false);
    expect(clampQty(0, "NOS")).toBe(1);
  });
});
