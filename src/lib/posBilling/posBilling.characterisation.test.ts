/**
 * Characterisation tests for the POS billing engine.
 *
 * These encode CURRENT POSSales.tsx money behaviour (as of Phase 1 extraction).
 * Existing quirks are requirements — do not "fix" failures by changing formulas.
 */
import { describe, expect, it } from "vitest";
import { computePosBillTotals } from "./billTotals";
import {
  addLine,
  resolveAddLinePrices,
  updateDiscountAmount,
  updateDiscountPercent,
  updatePrice,
  updateQty,
} from "./cartMutators";
import { mapSaleItemsToPosCart, resolveBillFlatForPosEdit } from "./editRestore";
import { calculatePosCartLineNet } from "./lineMath";
import type { PosCartItem } from "./types";

function line(partial: Partial<PosCartItem> & Pick<PosCartItem, "mrp" | "unitCost" | "quantity">): PosCartItem {
  const base: PosCartItem = {
    id: partial.id || "l1",
    barcode: partial.barcode || "BC1",
    productName: partial.productName || "Item",
    size: partial.size || "M",
    color: partial.color || "",
    quantity: partial.quantity,
    mrp: partial.mrp,
    originalMrp: partial.originalMrp ?? partial.mrp,
    gstPer: partial.gstPer ?? 0,
    purchaseGstPer: partial.purchaseGstPer,
    discountPercent: partial.discountPercent ?? 0,
    discountAmount: partial.discountAmount ?? 0,
    unitCost: partial.unitCost,
    rateAuthority: partial.rateAuthority,
    netAmount: 0,
    productId: partial.productId || "p1",
    variantId: partial.variantId || "v1",
    hsnCode: partial.hsnCode,
    productType: partial.productType,
  };
  return { ...base, netAmount: calculatePosCartLineNet(base) };
}

describe("POS billing characterisation — taxType", () => {
  const items = [
    line({ mrp: 1000, unitCost: 1000, quantity: 1, gstPer: 5 }),
    line({ mrp: 2000, unitCost: 2000, quantity: 1, gstPer: 12 }),
  ];

  it("inclusive: no bill-level GST added; net ≈ subtotal after flat", () => {
    const t = computePosBillTotals({
      items,
      taxType: "inclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "percent",
      roundOff: 0,
    });
    expect(t.mrp).toBe(3000);
    expect(t.subtotal).toBe(3000);
    expect(t.totalGst).toBe(0);
    expect(t.amountBeforeRoundOff).toBe(3000);
    expect(t.calculatedRoundOff).toBe(0);
    expect(t.finalAmount).toBe(3000);
  });

  it("exclusive: GST allocated after proportional flat share", () => {
    const t = computePosBillTotals({
      items,
      taxType: "exclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "percent",
      roundOff: 0,
    });
    // 1000*5% + 2000*12% = 50 + 240 = 290
    expect(t.totalGst).toBe(290);
    expect(t.amountBeforeRoundOff).toBe(3290);
    expect(t.calculatedRoundOff).toBe(0);
    expect(t.finalAmount).toBe(3290);
  });

  it("no_gst: never adds bill GST even when lines carry gstPer", () => {
    const t = computePosBillTotals({
      items,
      taxType: "no_gst",
      flatDiscountValue: 0,
      flatDiscountMode: "percent",
      roundOff: 0,
    });
    expect(t.totalGst).toBe(0);
    expect(t.amountBeforeRoundOff).toBe(3000);
    expect(t.finalAmount).toBe(3000);
  });
});

describe("POS billing characterisation — line discount", () => {
  it("inclusive: Disc% reduces line net and totals.discount", () => {
    const items = [line({ mrp: 2000, unitCost: 2000, quantity: 1, discountPercent: 10, gstPer: 5 })];
    const t = computePosBillTotals({
      items,
      taxType: "inclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "percent",
      roundOff: 0,
    });
    expect(items[0].netAmount).toBe(1800);
    expect(t.discount).toBe(200);
    expect(t.subtotal).toBe(1800);
    expect(t.finalAmount).toBe(1800);
  });

  it("exclusive: Disc% then GST on post-flat taxable", () => {
    const items = [line({ mrp: 2000, unitCost: 2000, quantity: 1, discountPercent: 10, gstPer: 5 })];
    const t = computePosBillTotals({
      items,
      taxType: "exclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "percent",
      roundOff: 0,
    });
    expect(t.subtotal).toBe(1800);
    expect(t.totalGst).toBe(90); // 5% of 1800
    expect(t.amountBeforeRoundOff).toBe(1890);
  });

  it("implicit MRP−unit gap counts as line discount", () => {
    const items = [line({ mrp: 1000, unitCost: 800, quantity: 2, gstPer: 0 })];
    expect(items[0].netAmount).toBe(1600);
    const t = computePosBillTotals({
      items,
      taxType: "inclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "percent",
      roundOff: 0,
    });
    expect(t.discount).toBe(400);
    expect(t.mrp).toBe(2000);
  });
});

describe("POS billing characterisation — flat discount cap", () => {
  it("flat % at cap (no line disc) applies fully", () => {
    const items = [line({ mrp: 1000, unitCost: 1000, quantity: 1 })];
    const t = computePosBillTotals({
      items,
      taxType: "inclusive",
      flatDiscountValue: 100,
      flatDiscountMode: "percent",
      roundOff: 0,
    });
    // maxCombined = 1000; flat 100% of (1000-0) = 1000; capped to maxFlat = 1000
    expect(t.flatDiscountAmount).toBe(1000);
    expect(t.finalAmount).toBe(0);
    expect(t.flatDiscountCapped).toBe(false);
  });

  it("flat amount just over remaining room after line disc is capped", () => {
    const items = [line({ mrp: 1000, unitCost: 1000, quantity: 1, discountPercent: 40 })];
    const t = computePosBillTotals({
      items,
      taxType: "inclusive",
      flatDiscountValue: 700, // wants 700 but maxFlat = 1000-400 = 600
      flatDiscountMode: "amount",
      roundOff: 0,
    });
    expect(t.discount).toBe(400);
    expect(t.maxFlatDiscountForGross).toBe(600);
    expect(t.flatDiscountAmount).toBe(600);
    expect(t.flatDiscountCapped).toBe(true);
    expect(t.amountBeforeRoundOff).toBe(0);
  });

  it("line Disc% over remaining room after flat is clamped (mutator)", () => {
    const items = [line({ id: "a", mrp: 1000, unitCost: 1000, quantity: 1 })];
    // flat already 600 → maxLine = 400
    const result = updateDiscountPercent(items, 0, 50, 600, null);
    expect(result.error?.code).toBe("DISCOUNT_CAP");
    // 50% would be 500; room 400 → clamped to 40%
    expect(result.items[0].discountPercent).toBe(40);
    expect(calculatePosCartLineNet(result.items[0])).toBe(600);
  });
});

describe("POS billing characterisation — grossBasis (add price)", () => {
  it("mrp basis: unitCost = displayMrp, discount forced 0", () => {
    const p = resolveAddLinePrices({
      grossBasis: "mrp",
      masterSalePrice: 800,
      masterMrp: 1000,
      brandDiscountPercent: 10,
    });
    expect(p.useMrpAsPrice).toBe(true);
    expect(p.unitCost).toBe(1000);
    expect(p.discountPercent).toBe(0);
    expect(p.displayMrp).toBe(1000);
  });

  it("sale_price basis: unitCost = salePrice; brand disc applies", () => {
    const p = resolveAddLinePrices({
      grossBasis: "sale_price",
      masterSalePrice: 800,
      masterMrp: 1000,
      brandDiscountPercent: 10,
    });
    expect(p.useMrpAsPrice).toBe(false);
    expect(p.unitCost).toBe(800);
    expect(p.discountPercent).toBe(10);
    expect(p.showDiscount).toBe(true);
  });

  it("overridePrice disables mrp-as-price even on mrp basis", () => {
    const p = resolveAddLinePrices({
      grossBasis: "mrp",
      masterSalePrice: 800,
      masterMrp: 1000,
      overridePrice: { sale_price: 900, mrp: 1000 },
      brandDiscountPercent: 5,
    });
    expect(p.useMrpAsPrice).toBe(false);
    expect(p.unitCost).toBe(900);
    expect(p.discountPercent).toBe(5);
  });

  it("addLine sale_price basis builds net with brand disc", () => {
    const { items } = addLine({
      items: [],
      grossBasis: "sale_price",
      garmentGstSettings: null,
      brandDiscountPercent: 10,
      product: {
        id: "p1",
        product_name: "Shirt",
        brand: "X",
        gst_per: 5,
        sale_gst_percent: 5,
        purchase_gst_percent: 5,
      },
      variant: { id: "v1", barcode: "B1", size: "M", sale_price: 800, mrp: 1000 },
      makeLineId: () => "fixed-id",
    });
    expect(items).toHaveLength(1);
    expect(items[0].unitCost).toBe(800);
    expect(items[0].discountPercent).toBe(10);
    // displayMrp = max(mrp,sale)=1000; net = 1000 - 10% - (1000-800) = 1000-100-200 = 700
    expect(items[0].netAmount).toBe(700);
  });

  it("addLine mrp basis: no brand disc; unit = displayMrp", () => {
    const { items } = addLine({
      items: [],
      grossBasis: "mrp",
      garmentGstSettings: null,
      brandDiscountPercent: 10,
      product: {
        id: "p1",
        product_name: "Shirt",
        brand: "X",
        gst_per: 5,
        sale_gst_percent: 5,
      },
      variant: { id: "v1", barcode: "B1", size: "M", sale_price: 800, mrp: 1000 },
    });
    expect(items[0].unitCost).toBe(1000);
    expect(items[0].discountPercent).toBe(0);
    expect(items[0].netAmount).toBe(1000);
  });
});

describe("POS billing characterisation — round-off boundaries", () => {
  it("auto round-off to nearest rupee (0.5 up)", () => {
    const items = [line({ mrp: 100.4, unitCost: 100.4, quantity: 1 })];
    const t = computePosBillTotals({
      items,
      taxType: "inclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "percent",
      roundOff: 0,
    });
    expect(t.amountBeforeRoundOff).toBeCloseTo(100.4, 5);
    expect(t.calculatedRoundOff).toBeCloseTo(-0.4, 5);
  });

  it("0.5 boundary rounds away via Math.round (bankers not used)", () => {
    const items = [line({ mrp: 100.5, unitCost: 100.5, quantity: 1 })];
    const t = computePosBillTotals({
      items,
      taxType: "inclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "percent",
      roundOff: 0,
    });
    // Math.round(100.5) === 101 in JS (toward +inf for .5)
    expect(t.calculatedRoundOff).toBeCloseTo(0.5, 5);
  });

  it("points applied AFTER round-off (POS order quirk)", () => {
    const items = [line({ mrp: 100.4, unitCost: 100.4, quantity: 1 })];
    const auto = computePosBillTotals({
      items,
      taxType: "inclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "percent",
      roundOff: 0,
    });
    const withRound = computePosBillTotals({
      items,
      taxType: "inclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "percent",
      roundOff: auto.calculatedRoundOff,
      pointsToRedeem: 10,
      calculateRedemptionValue: (p) => p * 1,
    });
    // amountBefore = 100.4; round = -0.4 → 100; points 10 → final 90
    expect(withRound.finalAmount).toBeCloseTo(90, 5);
  });
});

describe("POS billing characterisation — mixed GST rates", () => {
  it("exclusive multi-line mixed rates with flat ₹", () => {
    const items = [
      line({ id: "a", mrp: 1000, unitCost: 1000, quantity: 1, gstPer: 5 }),
      line({ id: "b", mrp: 1000, unitCost: 1000, quantity: 1, gstPer: 18 }),
    ];
    const t = computePosBillTotals({
      items,
      taxType: "exclusive",
      flatDiscountValue: 200,
      flatDiscountMode: "amount",
      roundOff: 0,
    });
    // flat 200 shared 50/50 → taxable 900 each
    // GST: 900*5% + 900*18% = 45 + 162 = 207
    expect(t.flatDiscountAmount).toBe(200);
    expect(t.totalGst).toBe(207);
    expect(t.amountBeforeRoundOff).toBe(2000 - 200 + 207);
  });
});

describe("POS billing characterisation — qty/price edits after discount", () => {
  it("qty edit recomputes net with existing Disc%", () => {
    let items = [line({ mrp: 500, unitCost: 500, quantity: 1, discountPercent: 20 })];
    expect(items[0].netAmount).toBe(400);
    const q = updateQty(items, 0, 3);
    items = q.items;
    expect(items[0].quantity).toBe(3);
    expect(items[0].netAmount).toBe(1200);
  });

  it("unit price edit clears Disc% and sets rateAuthority unit", () => {
    let items = [line({ mrp: 1000, unitCost: 1000, quantity: 1, discountPercent: 10 })];
    const r = updatePrice(items, 0, 700, 0, null);
    expect(r.error).toBeUndefined();
    items = r.items;
    expect(items[0].discountPercent).toBe(0);
    expect(items[0].rateAuthority).toBe("unit");
    expect(items[0].unitCost).toBe(700);
    expect(items[0].netAmount).toBe(700);
  });

  it("Disc ₹ maps to Disc % and clears discountAmount field", () => {
    const items = [line({ mrp: 1000, unitCost: 1000, quantity: 1 })];
    const r = updateDiscountAmount(items, 0, 250, 0, null);
    expect(r.items[0].discountPercent).toBe(25);
    expect(r.items[0].discountAmount).toBe(0);
    expect(r.items[0].netAmount).toBe(750);
  });
});

describe("POS billing characterisation — hold resume / edit restore", () => {
  it("resolveBillFlatForPosEdit prefers clean flat_discount_percent", () => {
    const res = resolveBillFlatForPosEdit(
      { flat_discount_percent: 10, flat_discount_amount: 99, gross_amount: 1000 },
      [],
    );
    expect(res).toEqual({ value: 10, mode: "percent", percentLooksClean: true });
  });

  it("resolveBillFlatForPosEdit falls back to flat_discount_amount", () => {
    const res = resolveBillFlatForPosEdit(
      { flat_discount_percent: 10.333, flat_discount_amount: 150, gross_amount: 1000 },
      [],
    );
    expect(res.mode).toBe("amount");
    expect(res.value).toBe(150);
    expect(res.percentLooksClean).toBe(false);
  });

  it("resolveBillFlatForPosEdit implies flat from per_qty_net vs line_total", () => {
    const res = resolveBillFlatForPosEdit({ gross_amount: 1000 }, [
      { line_total: 1000, per_qty_net_amount: 900, quantity: 1 },
    ]);
    expect(res.value).toBe(100);
    expect(res.mode).toBe("amount");
  });

  it("resume-held cart totals match persisted held line nets", () => {
    // Held cart stores CartItem[] as-is — recompute totals from those lines.
    const heldItems = [
      line({ id: "h1", mrp: 2000, unitCost: 2000, quantity: 1, gstPer: 5, discountPercent: 0 }),
    ];
    const t = computePosBillTotals({
      items: heldItems,
      taxType: "no_gst",
      flatDiscountValue: 5,
      flatDiscountMode: "percent",
      roundOff: 0,
    });
    expect(t.flatDiscountAmount).toBe(100);
    expect(t.finalAmount).toBe(1900);
  });

  it("edit-existing-bill maps sale_items and restores flat", () => {
    const sale = {
      gross_amount: 2000,
      discount_amount: 0,
      flat_discount_percent: 10,
      flat_discount_amount: 200,
    };
    const saleItems = [
      {
        id: "si1",
        barcode: "1",
        product_name: "3 PIS SET",
        size: "",
        color: "",
        quantity: 1,
        mrp: 2000,
        unit_price: 2000,
        gst_percent: 5,
        discount_percent: 0,
        line_total: 2000,
        product_id: "p1",
        variant_id: "v1",
        hsn_code: "62114",
      },
    ];
    const flat = resolveBillFlatForPosEdit(sale, saleItems);
    expect(flat.percentLooksClean).toBe(true);
    const cart = mapSaleItemsToPosCart(saleItems);
    // Quirk: edit load uses line_total as netAmount (not recalculated from Disc%).
    expect(cart[0].netAmount).toBe(2000);
    const t = computePosBillTotals({
      items: cart,
      taxType: "exclusive",
      flatDiscountValue: flat.value,
      flatDiscountMode: flat.mode,
      roundOff: 0,
    });
    expect(t.flatDiscountAmount).toBe(200);
    // exclusive GST on (2000-200)=1800 @ 5% = 90 → payable 1890
    expect(t.totalGst).toBe(90);
    expect(t.amountBeforeRoundOff).toBe(1890);
  });
});
