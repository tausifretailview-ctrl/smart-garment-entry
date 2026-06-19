import { describe, expect, it } from "vitest";
import { derivePaidAndStatus } from "@/utils/saleSettlement";

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
