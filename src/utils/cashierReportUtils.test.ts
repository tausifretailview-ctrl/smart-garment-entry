import { describe, expect, it } from "vitest";
import {
  getSaleReportDiscountAmount,
  getSaleReportGrossAmount,
  getSaleReportNetAmount,
} from "./cashierReportUtils";

describe("getSaleReportGrossAmount", () => {
  it("uses gross_amount when present", () => {
    expect(getSaleReportGrossAmount({ gross_amount: 1000, net_amount: 950 })).toBe(1000);
  });

  it("falls back to net_amount when gross is zero (rate-only / MRP-missing DC)", () => {
    expect(getSaleReportGrossAmount({ gross_amount: 0, net_amount: 750 })).toBe(750);
  });

  it("returns 0 when both are zero", () => {
    expect(getSaleReportGrossAmount({ gross_amount: 0, net_amount: 0 })).toBe(0);
  });
});

describe("getSaleReportDiscountAmount", () => {
  it("includes negative round-off as extra discount", () => {
    expect(
      getSaleReportDiscountAmount({
        discount_amount: 100,
        flat_discount_amount: 50,
        points_redeemed_amount: 10,
        round_off: -0.4,
      }),
    ).toBeCloseTo(160.4, 5);
  });

  it("reduces discount when round-off is positive", () => {
    expect(
      getSaleReportDiscountAmount({
        discount_amount: 100,
        flat_discount_amount: 0,
        round_off: 0.3,
      }),
    ).toBeCloseTo(99.7, 5);
  });
});

describe("getSaleReportNetAmount", () => {
  it("returns stored net when round-off already applied correctly", () => {
    // 1000 - 100 + (-0.4) = 899.6
    expect(
      getSaleReportNetAmount({
        gross_amount: 1000,
        discount_amount: 100,
        net_amount: 899.6,
        round_off: -0.4,
      }),
    ).toBeCloseTo(899.6, 5);
  });

  it("corrects net saved with inverted round-off sign", () => {
    // Correct: 1000 - 100 + (-0.4) = 899.6
    // Wrong save: 1000 - 100 - (-0.4) = 900.4
    expect(
      getSaleReportNetAmount({
        gross_amount: 1000,
        discount_amount: 100,
        net_amount: 900.4,
        round_off: -0.4,
      }),
    ).toBeCloseTo(899.6, 5);
  });

  it("leaves net unchanged when round-off is zero", () => {
    expect(
      getSaleReportNetAmount({
        gross_amount: 1000,
        discount_amount: 100,
        net_amount: 900,
        round_off: 0,
      }),
    ).toBe(900);
  });
});
