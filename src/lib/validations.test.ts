import { describe, expect, it } from "vitest";
import { validatePurchaseLineItem } from "./validations";

const baseLineItem = {
  product_id: "prod-1",
  sku_id: "sku-1",
  product_name: "Test Product",
  size: "Free",
  pur_price: 100,
  sale_price: 150,
  gst_per: 5,
  discount_percent: 0,
};

describe("validatePurchaseLineItem", () => {
  it("accepts decimal qty for KG UOM", () => {
    const result = validatePurchaseLineItem({
      ...baseLineItem,
      uom: "KG",
      qty: 0.5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects decimal qty below 0.001 for MTR UOM", () => {
    const result = validatePurchaseLineItem({
      ...baseLineItem,
      uom: "MTR",
      qty: 0.0005,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("0.001");
    }
  });

  it("requires integer qty of at least 1 for NOS UOM", () => {
    const halfResult = validatePurchaseLineItem({
      ...baseLineItem,
      uom: "NOS",
      qty: 0.5,
    });
    expect(halfResult.success).toBe(false);

    const zeroResult = validatePurchaseLineItem({
      ...baseLineItem,
      uom: "NOS",
      qty: 0,
    });
    expect(zeroResult.success).toBe(false);

    const validResult = validatePurchaseLineItem({
      ...baseLineItem,
      uom: "NOS",
      qty: 1,
    });
    expect(validResult.success).toBe(true);
  });
});
