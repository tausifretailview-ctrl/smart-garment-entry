import { describe, expect, it } from "vitest";
import { applyCategoryTierPricingToCart } from "@/lib/posBilling/categoryTierPricing";
import { addLine } from "@/lib/posBilling/cartMutators";
import {
  isPosGoodsAskQtyDialogEnabled,
  resolveGoodsQtyDialogDefaultPrice,
} from "@/utils/posGoodsAskQtyDialog";

describe("posGoodsAskQtyDialog", () => {
  it("isPosGoodsAskQtyDialogEnabled respects sale_settings flag", () => {
    expect(isPosGoodsAskQtyDialogEnabled({ pos_goods_ask_qty_dialog: true })).toBe(true);
    expect(isPosGoodsAskQtyDialogEnabled({ pos_goods_ask_qty_dialog: false })).toBe(false);
    expect(isPosGoodsAskQtyDialogEnabled(null)).toBe(false);
  });

  it("resolveGoodsQtyDialogDefaultPrice uses MRP on mrp basis", () => {
    expect(
      resolveGoodsQtyDialogDefaultPrice({ sale_price: 300, mrp: 449 }, "mrp"),
    ).toBe(449);
  });

  it("resolveGoodsQtyDialogDefaultPrice uses sale price on sale_price basis", () => {
    expect(
      resolveGoodsQtyDialogDefaultPrice({ sale_price: 300, mrp: 449 }, "sale_price"),
    ).toBe(300);
  });

  it("lines added via billing addLine participate in bundle tier repricing", () => {
    const product = {
      id: "p1",
      product_name: "TEE",
      category: "T-Shirt",
      gst_per: 5,
    };
    const variant = {
      id: "v1",
      barcode: "T001",
      sale_price: 299,
      mrp: 449,
      size: "M",
    };

    const { items } = addLine({
      items: [],
      product,
      variant,
      grossBasis: "sale_price",
      garmentGstSettings: null,
    });

    const withQty = items.map((item) => ({ ...item, quantity: 3 }));
    const repriced = applyCategoryTierPricingToCart(
      withQty,
      [
        {
          category: "T-Shirt",
          singleUnitPrice: 299,
          tierQty: 4,
          tierTotalPrice: 999,
          isActive: true,
        },
      ],
      null,
    );

    expect(repriced[0].category).toBe("T-Shirt");
    expect(repriced[0].quantity).toBe(3);
    expect(repriced[0].netAmount).toBe(897);
    expect(repriced[0].categoryTierApplied).toBe(true);
  });

  it("does not bundle a same-category line at a different sale price", () => {
    const product = {
      id: "p2",
      product_name: "TEE",
      category: "T-Shirt",
      gst_per: 5,
    };
    const variant = {
      id: "v2",
      barcode: "T600",
      sale_price: 449,
      mrp: 449,
      size: "L",
    };
    const { items } = addLine({
      items: [],
      product,
      variant,
      grossBasis: "sale_price",
      garmentGstSettings: null,
    });
    const withQty = items.map((item) => ({
      ...item,
      quantity: 4,
      netAmount: (item.unitCost || 0) * 4,
    }));
    const repriced = applyCategoryTierPricingToCart(
      withQty,
      [
        {
          category: "T-Shirt",
          singleUnitPrice: 299,
          tierQty: 4,
          tierTotalPrice: 999,
          isActive: true,
        },
      ],
      null,
    );
    expect(repriced[0].netAmount).toBe(1796);
    expect(repriced[0].categoryTierApplied).toBeUndefined();
  });
});
