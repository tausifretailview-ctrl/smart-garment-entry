import { describe, expect, it } from "vitest";
import { effectiveBarcodePriceTier } from "@/utils/barcodeValidation";
import { labelPrintMrp } from "./labelPrintPrice";

describe("labelPrintMrp", () => {
  it("uses sale price when MRP is 0 (Payal footwear)", () => {
    expect(labelPrintMrp(0, 1199)).toBe(1199);
    expect(labelPrintMrp(null, 1199)).toBe(1199);
    expect(labelPrintMrp(undefined, 1199)).toBe(1199);
  });

  it("keeps a real MRP", () => {
    expect(labelPrintMrp(1299, 999)).toBe(1299);
  });

  it("matches effectiveBarcodePriceTier", () => {
    const cases = [
      { mrp: 0, salePrice: 1199 },
      { mrp: 1299, salePrice: 999 },
      { mrp: null, salePrice: 409 },
      { mrp: 499, salePrice: 409 },
    ];
    for (const c of cases) {
      expect(labelPrintMrp(c.mrp, c.salePrice)).toBe(effectiveBarcodePriceTier(c));
    }
  });
});
