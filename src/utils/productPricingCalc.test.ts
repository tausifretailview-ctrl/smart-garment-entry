import { describe, expect, it } from "vitest";
import {
  applyPurchaseMarkupPricing,
  calcMarkedUpPrice,
  calcSaleFromMrp,
} from "./productPricingCalc";

describe("productPricingCalc", () => {
  describe("worked example (show_mrp on)", () => {
    it("Purchase 500 + Markup 100% → MRP 1000", () => {
      expect(calcMarkedUpPrice(500, 100)).toBe(1000);
    });

    it("MRP 1000 + Sale Disc 20% → Sale 800", () => {
      expect(calcSaleFromMrp(1000, 20)).toBe(800);
    });

    it("full chain via applyPurchaseMarkupPricing", () => {
      const r = applyPurchaseMarkupPricing({
        showMrp: true,
        purchasePrice: 500,
        markupPercent: 100,
        saleDiscPercent: 20,
      });
      expect(r.mrp).toBe(1000);
      expect(r.salePrice).toBe(800);
    });

    it("Pur/Markup change recomputes MRP then Sale; disc alone does not change MRP", () => {
      const afterMarkup = applyPurchaseMarkupPricing({
        showMrp: true,
        purchasePrice: 500,
        markupPercent: 100,
        saleDiscPercent: 0,
      });
      expect(afterMarkup.mrp).toBe(1000);
      expect(afterMarkup.salePrice).toBe(1000);

      // Disc-only: sale from existing MRP — MRP unchanged
      expect(calcSaleFromMrp(afterMarkup.mrp!, 20)).toBe(800);
      expect(afterMarkup.mrp).toBe(1000);
    });
  });

  describe("show_mrp off — legacy Markup → Sale direct", () => {
    it("Purchase 500 + Markup 100% → Sale 1000, no mrp key", () => {
      const r = applyPurchaseMarkupPricing({
        showMrp: false,
        purchasePrice: 500,
        markupPercent: 100,
        saleDiscPercent: 20, // must be ignored
      });
      expect(r.mrp).toBeUndefined();
      expect(r.salePrice).toBe(1000);
    });

    it("matches Math.round(pur * (1 + markup/100))", () => {
      expect(calcMarkedUpPrice(333, 33)).toBe(Math.round(333 * (1 + 33 / 100)));
    });
  });

  describe("Math.round money convention", () => {
    it("rounds mid values", () => {
      // 100 * 1.155 = 115.5 → 116
      expect(calcMarkedUpPrice(100, 15.5)).toBe(116);
      // 999 * 0.9 = 899.1 → 899
      expect(calcSaleFromMrp(999, 10)).toBe(899);
    });

    it("treats non-finite disc as 0", () => {
      expect(calcSaleFromMrp(1000, Number.NaN)).toBe(1000);
    });
  });
});
