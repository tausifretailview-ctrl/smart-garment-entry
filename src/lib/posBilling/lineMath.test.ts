import { describe, expect, it } from "vitest";
import { applyPosGarmentGstToItem } from "./lineMath";
import type { PosCartItem } from "./types";

function baseItem(overrides: Partial<PosCartItem>): PosCartItem {
  return {
    id: "1",
    barcode: "TEST",
    productName: "Test Item",
    size: "None",
    color: "",
    quantity: 1,
    mrp: 0,
    originalMrp: null,
    gstPer: 5,
    discountPercent: 0,
    discountAmount: 0,
    unitCost: 0,
    netAmount: 0,
    ...overrides,
  } as PosCartItem;
}

const SETTINGS_ON = {
  garment_gst_rule_enabled: true,
  garment_gst_threshold: 2625,
  garment_gst_below_rate: 5,
};

describe("applyPosGarmentGstToItem — garment/footwear GST threshold rule", () => {
  it("bumps a SERVICE item's GST up to 18% when price crosses the threshold (BAWLEE 'SUITS' case)", () => {
    const item = baseItem({
      productType: "service",
      mrp: 5990,
      unitCost: 5990,
      gstPer: 5,
    });
    const result = applyPosGarmentGstToItem(item, SETTINGS_ON);
    expect(result.gstPer).toBe(18);
  });

  it("does NOT force a SERVICE item's manually-set 18% back down when price is at/below threshold (the original bug)", () => {
    const item = baseItem({
      productType: "service",
      mrp: 500,
      unitCost: 500,
      gstPer: 18,
    });
    const result = applyPosGarmentGstToItem(item, SETTINGS_ON);
    expect(result.gstPer).toBe(18);
  });

  it("still bumps a GOODS item up to 18% above threshold (unaffected by the service carve-out)", () => {
    const item = baseItem({
      productType: undefined,
      mrp: 5990,
      unitCost: 5990,
      gstPer: 5,
    });
    const result = applyPosGarmentGstToItem(item, SETTINGS_ON);
    expect(result.gstPer).toBe(18);
  });

  it("still forces a GOODS item's inherited 18% back down at/below threshold", () => {
    const item = baseItem({
      productType: undefined,
      mrp: 500,
      unitCost: 500,
      gstPer: 18,
      purchaseGstPer: 18,
    });
    const result = applyPosGarmentGstToItem(item, SETTINGS_ON);
    expect(result.gstPer).toBe(5);
  });

  it("leaves everything unchanged when the org has not enabled the rule", () => {
    const item = baseItem({
      productType: "service",
      mrp: 5990,
      unitCost: 5990,
      gstPer: 5,
    });
    const result = applyPosGarmentGstToItem(item, { garment_gst_rule_enabled: false });
    expect(result.gstPer).toBe(5);
  });
});
