import { describe, expect, it } from "vitest";
import {
  adjustQtyByStep,
  allowsDecimalQty,
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

  it("allows decimal qty on service lines whatever their UOM", () => {
    const svc = { uom: "NOS", productType: "service" };
    expect(allowsDecimalQty(svc)).toBe(true);
    expect(parseQtyValue("0.5", svc)).toBe(0.5);
    expect(parseQtyValue(".8", svc)).toBe(0.8);
    expect(formatQtyForDisplay(0.5, svc)).toBe("0.5");
    expect(formatQtyForDisplay(2, svc)).toBe("2");
    expect(clampQty(0.5, svc)).toBe(0.5);
  });

  it("keeps whole numbers for normal stock items", () => {
    const goods = { uom: "NOS", productType: "goods" };
    expect(allowsDecimalQty(goods)).toBe(false);
    expect(allowsDecimalQty({ uom: "PCS" })).toBe(false);
    expect(clampQty(0.5, goods)).toBe(1);
    expect(allowsDecimalQty({ uom: "KG", productType: "goods" })).toBe(true);
  });

  it("keeps an already fractional line editable as a fraction", () => {
    expect(allowsDecimalQty({ uom: "NOS", quantity: 0.5 })).toBe(true);
    expect(allowsDecimalQty({ uom: "NOS", quantity: 2 })).toBe(false);
  });

  it("steps service lines by 1 without dropping to the 0.001 floor", () => {
    const svc = { uom: "NOS", productType: "service" };
    expect(adjustQtyByStep(0.5, 1, svc)).toBe(1.5);
    expect(adjustQtyByStep(1.5, -1, svc)).toBe(0.5);
    expect(adjustQtyByStep(0.5, -1, svc)).toBe(0.5);
    expect(adjustQtyByStep(2.5, 1, "KG")).toBe(2.501);
  });
});
