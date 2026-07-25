import { describe, expect, it } from "vitest";
import {
  derivePaidAndStatus,
  maxCombinedDiscountForGross,
  maxSaleReturnAdjustForPayable,
  normalizeDiscountsAgainstGross,
  normalizeSaleReturnAdjustAgainstBill,
  preSaveInvariants,
} from "@/utils/saleSettlement";

describe("derivePaidAndStatus — POS / sales settlement", () => {
  it("full cash payment: completed, paid_amount equals net", () => {
    const { paidAmount, paymentStatus } = derivePaidAndStatus({
      netAmount: 1000,
      saleReturnAdjust: 0,
      cashReceived: 1000,
      advanceApplied: 0,
      cnApplied: 0,
      discountGiven: 0,
    });
    expect(paidAmount).toBe(1000);
    expect(paymentStatus).toBe("completed");
  });

  it("partial payment: status partial, balance implied by net − settled", () => {
    const net = 5000;
    const cash = 2000;
    const { paidAmount, paymentStatus } = derivePaidAndStatus({
      netAmount: net,
      saleReturnAdjust: 0,
      cashReceived: cash,
      advanceApplied: 0,
      cnApplied: 0,
      discountGiven: 0,
    });
    expect(paidAmount).toBe(2000);
    expect(paymentStatus).toBe("partial");
    expect(net - paidAmount).toBe(3000);
  });

  it("discount + round-off within ₹1 tolerance → completed, not partial", () => {
    const net = 1000;
    const cash = 999.5;
    const { paymentStatus } = derivePaidAndStatus({
      netAmount: net,
      saleReturnAdjust: 0,
      cashReceived: cash,
      advanceApplied: 0,
      cnApplied: 0,
      discountGiven: 0,
    });
    expect(paymentStatus).toBe("completed");
  });

  it("settlement discount counts toward completed within tolerance", () => {
    const { paymentStatus, paidAmount } = derivePaidAndStatus({
      netAmount: 1000,
      saleReturnAdjust: 0,
      cashReceived: 950,
      advanceApplied: 0,
      cnApplied: 0,
      discountGiven: 50,
    });
    expect(paidAmount).toBe(1000);
    expect(paymentStatus).toBe("completed");
  });

  it("pay_later with zero paid stays pending", () => {
    const { paymentStatus } = derivePaidAndStatus({
      netAmount: 2500,
      saleReturnAdjust: 0,
      cashReceived: 0,
      advanceApplied: 0,
      cnApplied: 0,
      discountGiven: 0,
      paymentMethod: "pay_later",
    });
    expect(paymentStatus).toBe("pending");
  });

  it("does not double-count sale_return_adjust in settlement (net already post-SRA)", () => {
    // net 1000 is payable after SRA; sr 1000 must NOT make zero-cash look completed.
    const { paymentStatus } = derivePaidAndStatus({
      netAmount: 1000,
      saleReturnAdjust: 1000,
      cashReceived: 0,
      advanceApplied: 0,
      cnApplied: 0,
      discountGiven: 0,
    });
    expect(paymentStatus).toBe("pending");
  });
});

describe("derivePaidAndStatus — outstanding balance", () => {
  it("balance = net − paidAmount for partial cash sale", () => {
    const net = 7610;
    const cash = 16539.65 - 7610; // partial example shape
    const { paidAmount, paymentStatus } = derivePaidAndStatus({
      netAmount: net,
      saleReturnAdjust: 0,
      cashReceived: 4000,
      advanceApplied: 0,
      cnApplied: 0,
      discountGiven: 0,
    });
    expect(paymentStatus).toBe("partial");
    expect(net - paidAmount).toBe(3610);
  });
});

describe("normalizeSaleReturnAdjustAgainstBill", () => {
  it("caps S/R that would drive net negative and restores net to 0", () => {
    const result = normalizeSaleReturnAdjustAgainstBill({
      netAmount: -5000,
      saleReturnAdjust: 15000,
    });
    expect(result.saleReturnAdjust).toBe(10000);
    expect(result.netAmount).toBe(0);
    expect(result.excess).toBe(5000);
    expect(result.wasCapped).toBe(true);
  });

  it("leaves under-bill S/R untouched", () => {
    const result = normalizeSaleReturnAdjustAgainstBill({
      netAmount: 2000,
      saleReturnAdjust: 500,
    });
    expect(result.saleReturnAdjust).toBe(500);
    expect(result.netAmount).toBe(2000);
    expect(result.excess).toBe(0);
    expect(result.wasCapped).toBe(false);
  });

  it("maxSaleReturnAdjustForPayable = current payable + current S/R", () => {
    expect(maxSaleReturnAdjustForPayable(0, 4500)).toBe(4500);
    expect(maxSaleReturnAdjustForPayable(1200, 800)).toBe(2000);
  });
});

describe("normalizeDiscountsAgainstGross", () => {
  it("caps combined line+flat discount to gross and lifts net by excess", () => {
    const result = normalizeDiscountsAgainstGross({
      grossAmount: 1000,
      discountAmount: 800,
      flatDiscountAmount: 500,
      netAmount: -300,
    });
    expect(result.discountAmount + result.flatDiscountAmount).toBe(1000);
    expect(result.discountAmount).toBe(800); // line kept up to gross
    expect(result.flatDiscountAmount).toBe(200); // flat reduced into remaining room
    expect(result.netAmount).toBe(0);
    expect(result.excess).toBe(300);
    expect(result.wasCapped).toBe(true);
  });

  it("leaves under-gross discounts untouched", () => {
    const result = normalizeDiscountsAgainstGross({
      grossAmount: 1000,
      discountAmount: 100,
      flatDiscountAmount: 50,
      netAmount: 850,
    });
    expect(result.wasCapped).toBe(false);
    expect(result.discountAmount).toBe(100);
    expect(result.flatDiscountAmount).toBe(50);
    expect(result.netAmount).toBe(850);
  });

  it("maxCombinedDiscountForGross equals non-negative gross", () => {
    expect(maxCombinedDiscountForGross(4500)).toBe(4500);
    expect(maxCombinedDiscountForGross(-10)).toBe(0);
  });
});

describe("preSaveInvariants — negative net rejected", () => {
  it("throws when net_amount is negative (path-agnostic)", () => {
    expect(() =>
      preSaveInvariants({
        netAmount: -100,
        items: [{ quantity: 1, mrp: 500 }],
        saleReturnAdjust: 600,
        grossAmount: 500,
      }),
    ).toThrow(/cannot be negative/i);
  });

  it("throws when combined discount exceeds gross", () => {
    expect(() =>
      preSaveInvariants({
        netAmount: 0,
        items: [{ quantity: 1, mrp: 500 }],
        saleReturnAdjust: 0,
        grossAmount: 500,
        discountAmount: 400,
        flatDiscountAmount: 200,
      }),
    ).toThrow(/cannot exceed bill gross/i);
  });
});
