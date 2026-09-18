import { describe, expect, it } from "vitest";
import {
  buildTrendzoPaymentLines,
  formatTrendzoPaymentModeLabel,
  trendzoPartyAccountPair,
} from "./trendzoThermalPayment";

describe("buildTrendzoPaymentLines / formatTrendzoPaymentModeLabel", () => {
  it("prints mix CASH + CREDIT with amounts on one label (REHMANI POS/26-27/17)", () => {
    const lines = buildTrendzoPaymentLines({
      cashPaid: 2000,
      creditPaid: 2500,
      paidAmount: 4500,
    });
    expect(lines).toEqual([
      { label: "CASH", amount: 2000 },
      { label: "CREDIT", amount: 2500 },
    ]);
    expect(formatTrendzoPaymentModeLabel(lines)).toBe("CASH ₹2,000.00 + CREDIT ₹2,500.00");
  });

  it("includes UPI and CARD in the same mix string", () => {
    const lines = buildTrendzoPaymentLines({
      cashPaid: 500,
      upiPaid: 1000,
      cardPaid: 1500,
      creditPaid: 500,
    });
    expect(formatTrendzoPaymentModeLabel(lines)).toBe(
      "CASH ₹500.00 + UPI ₹1,000.00 + CARD ₹1,500.00 + CREDIT ₹500.00",
    );
  });

  it("falls back to paymentMethod + paidAmount when no breakdown", () => {
    const lines = buildTrendzoPaymentLines({ paidAmount: 4500, paymentMethod: "cash" });
    expect(formatTrendzoPaymentModeLabel(lines)).toBe("CASH ₹4,500.00");
  });

  it("falls back to paymentMethod name when nothing is paid", () => {
    expect(formatTrendzoPaymentModeLabel([], "pay_later")).toBe("PAY LATER");
  });
});

describe("trendzoPartyAccountPair", () => {
  it("puts Prev Bal and Advance on one pair-row", () => {
    expect(trendzoPartyAccountPair({ previousBalance: 16250, unusedAdvance: 1000 })).toEqual({
      left: "Prev Bal ₹16,250.00",
      right: "Advance ₹1,000.00",
    });
  });

  it("shows only Prev Bal when there is no unused advance", () => {
    expect(trendzoPartyAccountPair({ previousBalance: 16250, unusedAdvance: 0 })).toEqual({
      left: "Prev Bal ₹16,250.00",
    });
  });

  it("shows only Advance when outstanding is settled", () => {
    expect(trendzoPartyAccountPair({ previousBalance: 0, unusedAdvance: 1000 })).toEqual({
      left: "Advance ₹1,000.00",
    });
  });

  it("omits the row when both are empty", () => {
    expect(trendzoPartyAccountPair({ previousBalance: 0.4, unusedAdvance: 0 })).toBeNull();
  });
});
