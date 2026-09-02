import { describe, expect, it } from "vitest";
import {
  accessoryVariantCollapseKey,
  barcodeTierLookupKey,
  makePurchaseImportProductKey,
} from "@/utils/purchaseImportBarcodeTier";

const num = (v: unknown) => Number(v) || 0;

describe("purchaseImportBarcodeTier", () => {
  it("splits Jockey universal EAN by sale/MRP tier", () => {
    expect(barcodeTierLookupKey("8901326444238", 578, 549)).toBe("8901326444238::57800|54900");
    expect(barcodeTierLookupKey("8901326444238", 598, 569)).toBe("8901326444238::59800|56900");
    expect(
      barcodeTierLookupKey("8901326444238", 578, 549) !==
        barcodeTierLookupKey("8901326444238", 598, 569),
    ).toBe(true);
  });

  it("splits by sale price even when MRP is populated and identical (JOCKEY BRA case: mrp fixed at 200, sale_price 400 vs 500)", () => {
    expect(barcodeTierLookupKey("8901326331101", 200, 400)).not.toBe(
      barcodeTierLookupKey("8901326331101", 200, 500),
    );
  });

  it("product key includes price tier for import dedupe", () => {
    const base = {
      product_name: "BOXER BRIEF",
      brand: "JOCKEY",
      category: "UNDERWEAR",
      color: "",
      style: "8008",
    };
    const tier549 = makePurchaseImportProductKey({ ...base, sale_price: 549, mrp: 578 }, num);
    const tier569 = makePurchaseImportProductKey({ ...base, sale_price: 569, mrp: 598 }, num);
    expect(tier549).not.toBe(tier569);
  });

  it("accessory collapse keeps different MRP tiers separate", () => {
    expect(accessoryVariantCollapseKey("", 578, 549)).not.toBe(
      accessoryVariantCollapseKey("", 598, 569),
    );
    expect(accessoryVariantCollapseKey("Black", 578, 549)).toBe(
      accessoryVariantCollapseKey("Black", 578, 549),
    );
  });
});
