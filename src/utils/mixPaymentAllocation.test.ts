import { describe, expect, it } from "vitest";
import {
  allocateMixPaymentToBill,
  capPaymentModesToSettled,
  clampMixPaymentModeAmount,
  mixPaymentCreditDue,
  mixPaymentUnpaidOnBill,
} from "./mixPaymentAllocation";

describe("clampMixPaymentModeAmount", () => {
  it("blocks a single mode from exceeding the bill", () => {
    expect(clampMixPaymentModeAmount(8000, 0, 4500)).toBe(4500);
  });

  it("limits a mode to the remaining bill after other modes", () => {
    expect(clampMixPaymentModeAmount(3000, 3000, 4500)).toBe(1500);
  });

  it("allows exact bill fill", () => {
    expect(clampMixPaymentModeAmount(1500, 3000, 4500)).toBe(1500);
  });
});

describe("allocateMixPaymentToBill", () => {
  it("keeps under-tender mix amounts unchanged", () => {
    const result = allocateMixPaymentToBill({
      billAmount: 4500,
      cashAmount: 2000,
      cardAmount: 1000,
      upiAmount: 500,
    });
    expect(result).toMatchObject({
      cash: 2000,
      card: 1000,
      upi: 500,
      totalApplied: 3500,
      changeDue: 0,
    });
  });

  it("peels cash excess for ALBELI-style over-tender (8000 cash on 4500 bill)", () => {
    const result = allocateMixPaymentToBill({
      billAmount: 4500,
      cashAmount: 8000,
      cardAmount: 0,
      upiAmount: 0,
    });
    expect(result.cash).toBe(4500);
    expect(result.card).toBe(0);
    expect(result.upi).toBe(0);
    expect(result.totalApplied).toBe(4500);
    expect(result.tenderTotal).toBe(8000);
    expect(result.changeDue).toBe(3500);
  });

  it("peels cash first, then card, when multi-mode tender exceeds bill", () => {
    const result = allocateMixPaymentToBill({
      billAmount: 5000,
      cashAmount: 3000,
      cardAmount: 2500,
      upiAmount: 1000,
      bankAmount: 500,
    });
    // tender 7000, excess 2000 → cash 1000, card(2500+500)=3000, upi 1000
    expect(result.cash).toBe(1000);
    expect(result.card).toBe(3000);
    expect(result.upi).toBe(1000);
    expect(result.totalApplied).toBe(5000);
    expect(result.changeDue).toBe(2000);
  });
});

describe("capPaymentModesToSettled", () => {
  it("caps dashboard cash column for historical over-tender rows", () => {
    expect(
      capPaymentModesToSettled({
        cash: 8000,
        card: 0,
        upi: 0,
        settledPaid: 4500,
      }),
    ).toEqual({ cash: 4500, card: 0, upi: 0 });
  });
});

describe("mixPaymentCreditDue", () => {
  it("ignores paise left by a sale return (not credit)", () => {
    expect(mixPaymentCreditDue(1154.76, 1154)).toBe(0);
    expect(mixPaymentCreditDue(1154.76, 1154.76)).toBe(0);
  });

  it("keeps a real credit balance of ₹1 or more", () => {
    expect(mixPaymentCreditDue(1154.76, 1000)).toBe(154.76);
    expect(mixPaymentCreditDue(1000, 999)).toBe(1);
  });
});

describe("mixPaymentUnpaidOnBill (what needs a named customer)", () => {
  it("a walk-in bill settled by a sale return leaves nothing unpaid", () => {
    // ₹999 bill, ₹2,400 return typed: the bill is covered, ₹1,401 goes back as refund (tender 0).
    expect(mixPaymentUnpaidOnBill({ netAmount: 999, saleReturnAdjust: 2400, totalPaid: 0 })).toBe(0);
    // Return equal to the bill.
    expect(mixPaymentUnpaidOnBill({ netAmount: 999, saleReturnAdjust: 999, totalPaid: 0 })).toBe(0);
  });

  it("Mix Payment after a part return: only what is still short counts", () => {
    // ₹999 bill, ₹300 return, cash 400 + UPI 299.
    expect(mixPaymentUnpaidOnBill({ netAmount: 999, saleReturnAdjust: 300, totalPaid: 699 })).toBe(0);
    // ₹100 short: that is credit and needs a name.
    expect(mixPaymentUnpaidOnBill({ netAmount: 999, saleReturnAdjust: 300, totalPaid: 599 })).toBe(100);
  });

  it("paise left by a return are not credit", () => {
    expect(mixPaymentUnpaidOnBill({ netAmount: 2000, saleReturnAdjust: 845.24, totalPaid: 1154 })).toBe(0);
  });

  it("advance and customer credit used on the bill count as settled too", () => {
    expect(mixPaymentUnpaidOnBill({ netAmount: 1000, advanceApplied: 400, totalPaid: 600 })).toBe(0);
    expect(mixPaymentUnpaidOnBill({ netAmount: 1000, creditApplied: 250, advanceApplied: 250, totalPaid: 500 })).toBe(0);
    expect(mixPaymentUnpaidOnBill({ netAmount: 1000, advanceApplied: 400, totalPaid: 100 })).toBe(500);
  });

  it("no return, no advance: unchanged from before", () => {
    expect(mixPaymentUnpaidOnBill({ netAmount: 1000, totalPaid: 1000 })).toBe(0);
    expect(mixPaymentUnpaidOnBill({ netAmount: 1000, totalPaid: 400 })).toBe(600);
    expect(mixPaymentUnpaidOnBill({ netAmount: 1000, totalPaid: 0 })).toBe(1000);
  });
});
