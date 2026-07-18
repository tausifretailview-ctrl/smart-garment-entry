import { describe, expect, it } from "vitest";
import {
  allocateMixPaymentToBill,
  capPaymentModesToSettled,
  clampMixPaymentModeAmount,
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
