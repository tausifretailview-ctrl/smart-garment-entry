import { describe, expect, it } from "vitest";
import { buildSaleReturnCreditPrintInfo, shouldShowSaleReturnLogo } from "./saleReturnPrintMeta";

describe("buildSaleReturnCreditPrintInfo", () => {
  it("is pending when nothing has been redeemed", () => {
    const info = buildSaleReturnCreditPrintInfo({
      net_amount: 1000,
      credit_status: "pending",
      availableAmount: 1000,
      actual_adjusted_amt: 0,
    });
    expect(info).toMatchObject({ state: "pending", label: "PENDING", adjustedAmount: 0, balanceAmount: 1000 });
  });

  it("is adjusted with invoice numbers when fully redeemed", () => {
    const info = buildSaleReturnCreditPrintInfo({
      net_amount: 1000,
      credit_status: "adjusted",
      availableAmount: 0,
      actual_adjusted_amt: 1000,
      redeemedBills: [{ saleNumber: "INV/26-27/9", amount: 1000 }],
    });
    expect(info).toMatchObject({ state: "adjusted", adjustedAmount: 1000, balanceAmount: 0 });
    expect(info?.redeemedBills).toHaveLength(1);
  });

  it("is partially adjusted with the remaining balance", () => {
    const info = buildSaleReturnCreditPrintInfo({
      net_amount: 1000,
      credit_status: "partially_adjusted",
      availableAmount: 400,
      actual_adjusted_amt: 600,
    });
    expect(info).toMatchObject({ state: "partially_adjusted", adjustedAmount: 600, balanceAmount: 400 });
  });

  it("derives adjusted amount from live balance when redeem data is missing", () => {
    const info = buildSaleReturnCreditPrintInfo({
      net_amount: 500,
      credit_status: "adjusted",
      availableAmount: 0,
      actual_adjusted_amt: 0,
    });
    expect(info).toMatchObject({ state: "adjusted", adjustedAmount: 500, balanceAmount: 0 });
  });

  it("treats credit adjusted to customer outstanding as adjusted", () => {
    const info = buildSaleReturnCreditPrintInfo({
      net_amount: 700,
      credit_status: "adjusted_outstanding",
      availableAmount: 700,
    });
    expect(info).toMatchObject({ state: "adjusted", adjustedAmount: 700, balanceAmount: 0 });
  });

  it("marks refunded credit and skips cash refunds", () => {
    expect(
      buildSaleReturnCreditPrintInfo({ net_amount: 300, credit_status: "refunded", availableAmount: 0 })?.state,
    ).toBe("refunded");
    expect(
      buildSaleReturnCreditPrintInfo({ net_amount: 300, refund_type: "cash_refund", availableAmount: 0 }),
    ).toBeNull();
  });
});

describe("shouldShowSaleReturnLogo", () => {
  it("needs a logo url", () => {
    expect(shouldShowSaleReturnLogo({ logoUrl: "", saleSettings: {} })).toBe(false);
    expect(shouldShowSaleReturnLogo({ logoUrl: "https://x/logo.png", saleSettings: {} })).toBe(true);
  });

  it("hides logo on preprinted letterhead unless opted in", () => {
    const base = { logoUrl: "https://x/logo.png", originalSaleNumber: "INV/26-27/1" };
    expect(
      shouldShowSaleReturnLogo({ ...base, saleSettings: { invoice_template: "retail-erp-preprinted" } }),
    ).toBe(false);
    expect(
      shouldShowSaleReturnLogo({
        ...base,
        saleSettings: { invoice_template: "retail-erp-preprinted", print_logo_on_preprinted_letterhead: true },
      }),
    ).toBe(true);
  });

  it("uses the POS template for POS returns", () => {
    expect(
      shouldShowSaleReturnLogo({
        logoUrl: "https://x/logo.png",
        originalSaleNumber: "POS/26-27/3",
        saleSettings: { invoice_template: "retail-erp-preprinted", pos_invoice_template: "professional" },
      }),
    ).toBe(true);
  });
});
