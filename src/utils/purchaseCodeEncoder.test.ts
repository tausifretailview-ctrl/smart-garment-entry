import { describe, expect, it } from "vitest";
import { encodePurchasePrice, getEffectivePurchasePrice } from "./purchaseCodeEncoder";

describe("getEffectivePurchasePrice extra percent", () => {
  it("leaves the purchase rate unchanged when extra % is disabled", () => {
    expect(getEffectivePurchasePrice(500, 0, false, false, 10)).toBe(500);
  });

  it("adds 10% on the purchase rate for the label alphabet (500 → 550)", () => {
    expect(getEffectivePurchasePrice(500, 0, false, true, 10)).toBe(550);
  });

  it("does not apply a 0 extra percent even when enabled", () => {
    expect(getEffectivePurchasePrice(500, 0, false, true, 0)).toBe(500);
  });

  it("applies extra % after GST when both are enabled", () => {
    // 500 + 5% GST = 525; + 10% = 577.5 → 578
    expect(getEffectivePurchasePrice(500, 5, true, true, 10)).toBe(578);
  });
});

describe("encodePurchasePrice with extra rate", () => {
  it("encodes 550 as FFA with ABCDEFGHIK (5=F, 5=F, 0=A)", () => {
    const encoded = encodePurchasePrice(550, "ABCDEFGHIK", "2026-08-19");
    expect(encoded).toContain("FFA");
  });
});
