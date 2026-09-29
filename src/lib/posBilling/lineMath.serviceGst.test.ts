import { describe, expect, it } from "vitest";
import {
  applyPosGarmentGstToItem,
  calculatePosCartLineNet,
  findPosGoodsMergeIndex,
  posCartQtyForVariant,
  posPickedPriceKey,
} from "./lineMath";
import { addLine, updateDiscountPercent } from "./cartMutators";
import type { PosCartItem } from "./types";
import type { GarmentGstRuleSettings } from "@/utils/gstRules";

const garmentSettings: GarmentGstRuleSettings = {
  garment_gst_rule_enabled: true,
  garment_gst_threshold: 1000,
  garment_gst_below_rate: 5,
};

function cartLine(partial: Partial<PosCartItem> & Pick<PosCartItem, "gstPer" | "productType">): PosCartItem {
  const base: PosCartItem = {
    id: "l1",
    barcode: "SVC1",
    productName: "Alteration",
    size: "",
    color: "",
    quantity: 1,
    mrp: 500,
    originalMrp: 500,
    gstPer: partial.gstPer,
    purchaseGstPer: 18,
    discountPercent: 0,
    discountAmount: 0,
    unitCost: 500,
    netAmount: 0,
    productId: "p1",
    variantId: "v1",
    ...partial,
  };
  return { ...base, netAmount: calculatePosCartLineNet(base) };
}

describe("applyPosGarmentGstToItem — service vs garment", () => {
  it("uses the sale-price GST slab on a service at or below the threshold (18% → 5%)", () => {
    const next = applyPosGarmentGstToItem(
      cartLine({ productType: "service", gstPer: 18, mrp: 500, unitCost: 500 }),
      garmentSettings,
    );
    expect(next.gstPer).toBe(5);
    expect(next.netAmount).toBe(500);
  });

  it("bumps a service above the threshold to 18%", () => {
    const next = applyPosGarmentGstToItem(
      cartLine({ productType: "service", gstPer: 5, mrp: 1500, unitCost: 1500 }),
      garmentSettings,
    );
    expect(next.gstPer).toBe(18);
  });

  it("still forces a garment at/below threshold from 18% down to the slab rate", () => {
    const next = applyPosGarmentGstToItem(
      cartLine({ productType: undefined, gstPer: 18, mrp: 500, unitCost: 500 }),
      garmentSettings,
    );
    expect(next.gstPer).toBe(5);
  });

  it("still applies the apparel rule to combo lines (physical garment bundles)", () => {
    const next = applyPosGarmentGstToItem(
      cartLine({ productType: "combo", gstPer: 18, mrp: 500, unitCost: 500 }),
      garmentSettings,
    );
    expect(next.gstPer).toBe(5);
  });

  it("still bumps a garment above the threshold to 18%", () => {
    const next = applyPosGarmentGstToItem(
      cartLine({ productType: undefined, gstPer: 5, mrp: 1500, unitCost: 1500 }),
      garmentSettings,
    );
    expect(next.gstPer).toBe(18);
  });
});

describe("POS cart recompute applies sale-price GST slab to services", () => {
  it("add and a later line recompute set service GST from entered sale price", () => {
    const added = addLine({
      items: [],
      grossBasis: "sale_price",
      garmentGstSettings: garmentSettings,
      product: {
        id: "p1",
        product_name: "Stitching",
        gst_per: 18,
        sale_gst_percent: 18,
        purchase_gst_percent: 18,
        product_type: "service",
      },
      variant: { id: "v1", barcode: "S1", size: "", sale_price: 400, mrp: 400 },
      makeLineId: () => "svc-1",
    });
    expect(added.items[0].gstPer).toBe(5);

    const afterDisc = updateDiscountPercent(added.items, 0, 0, 0, garmentSettings);
    expect(afterDisc.error).toBeUndefined();
    expect(afterDisc.items[0].gstPer).toBe(5);

    const expensive = addLine({
      items: [],
      grossBasis: "sale_price",
      garmentGstSettings: garmentSettings,
      product: {
        id: "p2",
        product_name: "Stitching",
        gst_per: 5,
        sale_gst_percent: 5,
        purchase_gst_percent: 5,
        product_type: "service",
      },
      variant: { id: "v2", barcode: "S2", size: "", sale_price: 2500, mrp: 2500 },
      overridePrice: { sale_price: 2500, mrp: 2500 },
      makeLineId: () => "svc-2",
    });
    expect(expensive.items[0].gstPer).toBe(18);
  });
});

describe("POS goods: one SKU scanned at two picked prices", () => {
  const product = { id: "p1", product_name: "BRA", gst_per: 5, sale_gst_percent: 5, purchase_gst_percent: 5 };
  const variant = { id: "v1", barcode: "8901326331163", size: "38", sale_price: 749, mrp: 749, stock_qty: 5 };

  it("keeps two lines at two MRPs and merges the same price", () => {
    const first = addLine({ items: [], grossBasis: "sale_price", garmentGstSettings: null, product, variant,
      overridePrice: { sale_price: 749, mrp: 749 } });
    const second = addLine({ items: first.items, grossBasis: "sale_price", garmentGstSettings: null, product, variant,
      overridePrice: { sale_price: 729, mrp: 729 }, makeLineId: () => "v1-729" });
    expect(second.items).toHaveLength(2);
    expect(second.items.map((i) => i.id)).toEqual(["v1", "v1-729"]);
    expect(posCartQtyForVariant(second.items, "v1")).toBe(2);

    const third = addLine({ items: second.items, grossBasis: "sale_price", garmentGstSettings: null, product, variant,
      overridePrice: { sale_price: 729, mrp: 729 } });
    expect(third.merged).toBe(true);
    expect(third.items[1].quantity).toBe(2);
  });

  it("without a picked price, a re-scan still merges into the master-price line", () => {
    const first = addLine({ items: [], grossBasis: "sale_price", garmentGstSettings: null, product, variant });
    const again = addLine({ items: first.items, grossBasis: "sale_price", garmentGstSettings: null, product, variant });
    expect(again.items).toHaveLength(1);
    expect(again.items[0].quantity).toBe(2);
    expect(findPosGoodsMergeIndex(again.items, "v1", posPickedPriceKey({ sale_price: 729, mrp: 729 }))).toBe(-1);
  });
});
