import { describe, expect, it } from "vitest";
import { computePosBillTotals } from "./billTotals";
import { buildPosSalePersistPayload } from "./buildSaleData";
import { calculatePosCartLineNet } from "./lineMath";
import type { PosCartItem } from "./types";
import { derivePaidAndStatus } from "@/utils/saleSettlement";
import { posCreditChunkKey } from "@/utils/applyPosCredit";

function line(partial: Partial<PosCartItem> & Pick<PosCartItem, "mrp" | "unitCost" | "quantity">): PosCartItem {
  const base: PosCartItem = {
    id: "line-1",
    barcode: "B",
    productName: "Item",
    size: "M",
    color: "",
    quantity: partial.quantity,
    mrp: partial.mrp,
    originalMrp: partial.mrp,
    gstPer: 0,
    discountPercent: 0,
    discountAmount: 0,
    unitCost: partial.unitCost,
    netAmount: 0,
    productId: "p1",
    variantId: "v1",
  };
  return { ...base, netAmount: calculatePosCartLineNet(base) };
}

describe("Rule B POS bill totals", () => {
  it("CN ₹500 on a ₹250 bill keeps net at 250 and payable at 0", () => {
    const items = [line({ mrp: 250, unitCost: 250, quantity: 1 })];
    const totals = computePosBillTotals({
      items,
      taxType: "inclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "amount",
      saleReturnAdjust: 0,
      creditApplied: 250,
      roundOff: 0,
    });
    expect(totals.billAmount).toBe(250);
    expect(totals.payable).toBe(0);
    expect(totals.finalAmount).toBe(0);
    const payload = buildPosSalePersistPayload({
      customerName: "TAMANNA",
      items,
      totals,
      saleReturnAdjust: 0,
      roundOff: 0,
      creditApplied: 250,
      taxType: "inclusive",
    });
    expect(payload.netAmount).toBe(250);
    expect(payload.creditApplied).toBe(250);
  });

  it("CN ₹500 on a ₹500 bill", () => {
    const totals = computePosBillTotals({
      items: [line({ mrp: 500, unitCost: 500, quantity: 1 })],
      taxType: "inclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "amount",
      creditApplied: 500,
      roundOff: 0,
    });
    expect(totals.billAmount).toBe(500);
    expect(totals.payable).toBe(0);
  });

  it("CN ₹500 on an ₹800 bill leaves ₹300 payable for cash", () => {
    const totals = computePosBillTotals({
      items: [line({ mrp: 800, unitCost: 800, quantity: 1 })],
      taxType: "inclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "amount",
      creditApplied: 500,
      roundOff: 0,
    });
    expect(totals.billAmount).toBe(800);
    expect(totals.payable).toBe(300);
    const settled = derivePaidAndStatus({
      netAmount: totals.billAmount,
      saleReturnAdjust: 500,
      cashReceived: 300,
      advanceApplied: 0,
      cnApplied: 500,
      discountGiven: 0,
    });
    expect(settled.paidAmount).toBe(300);
    expect(settled.paymentStatus).toBe("completed");
  });

  it("the remaining ₹250 of a ₹500 note fits a second ₹250 bill", () => {
    const totals = computePosBillTotals({
      items: [line({ mrp: 250, unitCost: 250, quantity: 1 })],
      taxType: "inclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "amount",
      creditApplied: 250,
      roundOff: 0,
    });
    expect(totals.billAmount).toBe(250);
    expect(totals.payable).toBe(0);
  });

  it("S/R chevron uses the same bill and payable split", () => {
    const totals = computePosBillTotals({
      items: [line({ mrp: 250, unitCost: 250, quantity: 1 })],
      taxType: "inclusive",
      flatDiscountValue: 0,
      flatDiscountMode: "amount",
      saleReturnAdjust: 250,
      creditApplied: 0,
      roundOff: 0,
    });
    expect(totals.billAmount).toBe(250);
    expect(totals.payable).toBe(0);
  });
});

describe("POS credit idempotency keys", () => {
  it("reuses one base key and distinguishes each credit note", () => {
    const base = "retry-key-1";
    expect(posCreditChunkKey(base, "note-a")).toBe("retry-key-1:note-a");
    expect(posCreditChunkKey(base, "note-a")).toBe(posCreditChunkKey(base, "note-a"));
    expect(posCreditChunkKey(base, "note-b")).not.toBe(posCreditChunkKey(base, "note-a"));
  });
});
