import { describe, expect, it } from "vitest";
import {
  applyPurchasePricesToPosCart,
  computePosLiveMargin,
} from "./liveMargin";
import type { PosCartItem } from "./types";

const line = (over: Partial<PosCartItem> = {}): PosCartItem =>
  ({
    id: "1",
    barcode: "300004230",
    productName: "CORD SET - 04",
    size: "L",
    color: "",
    quantity: 1,
    mrp: 1450,
    originalMrp: 1450,
    gstPer: 0,
    discountPercent: 0,
    discountAmount: 0,
    unitCost: 1450,
    purPrice: 799,
    netAmount: 1450,
    productId: "p1",
    variantId: "v1",
    ...over,
  }) as PosCartItem;

describe("computePosLiveMargin", () => {
  it("updates profit live when flat discount changes bill net", () => {
    const items = [line()];
    const before = computePosLiveMargin({ items, billNet: 1450 });
    expect(before.profit).toBe(651);
    expect(before.marginPercent).toBeCloseTo(44.9, 1);

    const afterTenPercent = computePosLiveMargin({ items, billNet: 1305 });
    expect(afterTenPercent.profit).toBe(506);
    expect(afterTenPercent.totalSale).toBe(1305);

    const afterRound = computePosLiveMargin({ items, billNet: 1300 });
    expect(afterRound.profit).toBe(501);
    expect(afterRound.marginPercent).toBeCloseTo(38.5, 1);
  });

  it("does not treat missing cost as 100% of line net when bill net is used", () => {
    const items = [line({ purPrice: 0 })];
    const m = computePosLiveMargin({ items, billNet: 1300 });
    expect(m.totalCost).toBe(0);
    expect(m.profit).toBe(1300);
  });
});

describe("applyPurchasePricesToPosCart", () => {
  it("fills purPrice on POS dashboard edit restore", () => {
    const restored = [line({ purPrice: undefined })];
    const next = applyPurchasePricesToPosCart(restored, { v1: 799 });
    expect(next[0].purPrice).toBe(799);
    const margin = computePosLiveMargin({ items: next, billNet: 1300 });
    expect(margin.profit).toBe(501);
    expect(margin.marginPercent).toBeCloseTo(38.5, 1);
  });
});
