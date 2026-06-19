import { describe, expect, it } from "vitest";
import {
  isCompletedSaleUnderpaidDrift,
  isPaidAmountVoucherDrift,
  MONEY_SETTLEMENT_TOLERANCE,
} from "../helpers/saleDriftCheck";
import { derivePaidAndStatus } from "@/utils/saleSettlement";

describe("accounting drift detection", () => {
  it("flags completed sale with paid_amount < net − tolerance", () => {
    expect(
      isCompletedSaleUnderpaidDrift({
        payment_status: "completed",
        net_amount: 1000,
        paid_amount: 998,
      }),
    ).toBe(true);
  });

  it("does not flag completed sale within ₹1 tolerance", () => {
    expect(
      isCompletedSaleUnderpaidDrift({
        payment_status: "completed",
        net_amount: 1000,
        paid_amount: 999.5,
      }),
    ).toBe(false);
  });

  it("does not flag partial sales as underpaid-completed drift", () => {
    expect(
      isCompletedSaleUnderpaidDrift({
        payment_status: "partial",
        net_amount: 1000,
        paid_amount: 500,
      }),
    ).toBe(false);
  });

  it("detects paid_amount vs voucher non-advance drift (> ₹1)", () => {
    expect(isPaidAmountVoucherDrift(5000, 4800)).toBe(true);
    expect(isPaidAmountVoucherDrift(5000, 4999.5)).toBe(false);
  });

  it("derivePaidAndStatus would NOT mark underpaid bill completed — drift check catches stale DB row", () => {
    const net = 473;
    const stalePaid = 400;
    const derived = derivePaidAndStatus({
      netAmount: net,
      saleReturnAdjust: 0,
      cashReceived: stalePaid,
      advanceApplied: 0,
      cnApplied: 0,
      discountGiven: 0,
    });
    expect(derived.paymentStatus).toBe("partial");
    expect(
      isCompletedSaleUnderpaidDrift({
        payment_status: "completed",
        net_amount: net,
        paid_amount: stalePaid,
      }),
    ).toBe(true);
    expect(MONEY_SETTLEMENT_TOLERANCE).toBe(1);
  });
});
