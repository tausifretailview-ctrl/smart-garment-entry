import { describe, expect, it } from "vitest";
import {
  advanceApplicationRoomCap,
  computeExchangeRefundDue,
  derivePaidAndStatus,
  isPosExchangeRefundPaymentVoucher,
  isVoucherNumberUniqueViolation,
  maxCombinedDiscountForGross,
  maxSaleReturnAdjustForPayable,
  normalizeDiscountsAgainstGross,
  normalizeSaleReturnAdjustAgainstBill,
  preSaveInvariants,
  voucherNumberWithRegeneratedBase,
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

describe("computeExchangeRefundDue — keep net≥0 + explicit refund", () => {
  it("after bill cap: net=0, sra=applied, explicit refund is the excess", () => {
    const result = computeExchangeRefundDue({
      netAmount: 0,
      saleReturnAdjust: 2000,
      explicitRefundAmount: 500,
    });
    expect(result.billAmount).toBe(2000);
    expect(result.appliedSr).toBe(2000);
    expect(result.refundDue).toBe(500);
    expect(result.isExchangeRefund).toBe(true);
  });

  it("before bill cap: negative net carries legacy excess", () => {
    const result = computeExchangeRefundDue({
      netAmount: -500,
      saleReturnAdjust: 2500,
      explicitRefundAmount: 0,
    });
    expect(result.billAmount).toBe(2000);
    expect(result.refundDue).toBe(500);
    expect(result.isExchangeRefund).toBe(true);
  });

  it("equal exchange: no refund due", () => {
    const result = computeExchangeRefundDue({
      netAmount: 0,
      saleReturnAdjust: 2000,
      explicitRefundAmount: 0,
    });
    expect(result.refundDue).toBe(0);
    expect(result.isExchangeRefund).toBe(false);
  });

  it("partial S/R under bill: not an exchange refund", () => {
    const result = computeExchangeRefundDue({
      netAmount: 500,
      saleReturnAdjust: 1500,
      explicitRefundAmount: 0,
    });
    expect(result.isExchangeRefund).toBe(false);
    expect(result.refundDue).toBe(0);
  });
});

describe("isPosExchangeRefundPaymentVoucher", () => {
  it("matches exchange cash refund descriptions", () => {
    expect(
      isPosExchangeRefundPaymentVoucher({
        description: "Refund paid for POS exchange POS/26-27/1",
      }),
    ).toBe(true);
    expect(
      isPosExchangeRefundPaymentVoucher({
        description: "Round off adjustment for POS exchange POS/26-27/1",
      }),
    ).toBe(true);
  });

  it("does not match ordinary customer payment vouchers", () => {
    expect(
      isPosExchangeRefundPaymentVoucher({
        description: "Refund paid to customer",
        payment_method: "cash",
      }),
    ).toBe(false);
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

describe("receipt voucher number collision helpers", () => {
  it("detects uq_voucher_entries_number_active (customer payment error)", () => {
    expect(
      isVoucherNumberUniqueViolation({
        code: "23505",
        message:
          'duplicate key value violates unique constraint "uq_voucher_entries_number_active"',
      }),
    ).toBe(true);
    expect(isVoucherNumberUniqueViolation({ code: "23503", message: "fk" })).toBe(false);
  });

  it("preserves -N / -OB suffixes when regenerating base after collision", () => {
    expect(voucherNumberWithRegeneratedBase("RCP/26-27/100", "RCP/26-27/105")).toBe(
      "RCP/26-27/105",
    );
    expect(voucherNumberWithRegeneratedBase("RCP/26-27/100-1", "RCP/26-27/105")).toBe(
      "RCP/26-27/105-1",
    );
    expect(voucherNumberWithRegeneratedBase("RCP/26-27/100-OB", "RCP/26-27/105")).toBe(
      "RCP/26-27/105-OB",
    );
  });
});

describe("advanceApplicationRoomCap — UZMA KUDIA cash+advance over-settle", () => {
  it("caps room at net − cash − existing advance (INV/2841 case)", () => {
    // net 19149, cash 4149, advance already 0 → room 15000 (not 19149)
    expect(
      advanceApplicationRoomCap({
        netAmount: 19149,
        alreadyAppliedAdvance: 0,
        cashLikeSettled: 4149,
      }),
    ).toBe(15000);
  });

  it("blocks a requested 17101 when only 15000 residual remains", () => {
    const room = advanceApplicationRoomCap({
      netAmount: 19149,
      alreadyAppliedAdvance: 0,
      cashLikeSettled: 4149,
    });
    expect(17101).toBeGreaterThan(room + 1);
    expect(room + 4149).toBe(19149);
  });

  it("after reallocation, 2896 residual for advance is 13000 − 10899 = 2101", () => {
    expect(
      advanceApplicationRoomCap({
        netAmount: 17300,
        alreadyAppliedAdvance: 10899,
        cashLikeSettled: 4300,
      }),
    ).toBe(2101);
  });

  it("returns 0 when cash + advance already cover net", () => {
    expect(
      advanceApplicationRoomCap({
        netAmount: 19149,
        alreadyAppliedAdvance: 15000,
        cashLikeSettled: 4149,
      }),
    ).toBe(0);
  });
});
