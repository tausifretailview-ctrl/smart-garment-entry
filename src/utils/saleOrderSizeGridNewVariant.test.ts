import { describe, expect, it } from "vitest";
import {
  isSaleOrderCustomGridVariant,
  planSaleOrderNewVariant,
} from "./saleOrderSizeGridNewVariant";

const white = {
  color: "WHITE",
  product_id: "prod-white",
  product_name: "SHOES WHITE",
  sale_price: 1200,
  mrp: 1500,
  pur_price: 800,
};

describe("isSaleOrderCustomGridVariant", () => {
  it("treats a typed size as new", () => {
    expect(isSaleOrderCustomGridVariant({ isCustomSize: true, id: "custom-1" })).toBe(true);
    expect(isSaleOrderCustomGridVariant({ id: "custom-9" })).toBe(true);
  });

  it("leaves an existing variant alone", () => {
    expect(isSaleOrderCustomGridVariant({ id: "sku-4", isCustomSize: false })).toBe(false);
  });
});

describe("planSaleOrderNewVariant", () => {
  it("adds a size onto the colour's own product and copies its price", () => {
    const plan = planSaleOrderNewVariant({
      size: " 11 ",
      color: "WHITE",
      fallbackProductId: "prod-primary",
      fallbackProductName: "SHOES",
      existingVariants: [white, { color: "BLACK", product_id: "prod-black", sale_price: 900, mrp: 900, pur_price: 400 }],
      enteredSalePrice: 0,
    });
    expect(plan).toEqual({
      productId: "prod-white",
      productName: "SHOES WHITE",
      size: "11",
      color: "WHITE",
      salePrice: 1200,
      mrp: 1500,
      purPrice: 800,
    });
  });

  it("keeps a price typed in the grid", () => {
    const plan = planSaleOrderNewVariant({
      size: "9",
      color: "WHITE",
      fallbackProductId: "prod-primary",
      existingVariants: [white],
      enteredSalePrice: 999,
      enteredMrp: 1100,
    });
    expect(plan?.salePrice).toBe(999);
    expect(plan?.mrp).toBe(1100);
  });

  it("puts a new colour on the primary product", () => {
    const plan = planSaleOrderNewVariant({
      size: "6",
      color: "RED",
      fallbackProductId: "prod-primary",
      fallbackProductName: "SHOES",
      existingVariants: [white],
    });
    expect(plan?.productId).toBe("prod-primary");
    expect(plan?.productName).toBe("SHOES");
    expect(plan?.color).toBe("RED");
    expect(plan?.salePrice).toBe(1200);
  });

  it("rejects a blank size", () => {
    expect(
      planSaleOrderNewVariant({
        size: "  ",
        color: "WHITE",
        fallbackProductId: "prod-primary",
        existingVariants: [white],
      }),
    ).toBeNull();
  });
});
