import { describe, expect, it } from "vitest";
import { isInvoiceLinkedSaleReceipt } from "@/utils/posCashierCashIn";
import {
  classifyDailyTallyPaymentOutflow,
  isOperatingExpenseVoucher,
  paymentMethodFromCashBankAccount,
  THIRD_PARTY_JOURNAL_REFERENCE_TYPE,
  THIRD_PARTY_VOUCHER_REFERENCE_TYPE,
  voucherTypeForThirdPartyDirection,
} from "./thirdPartyVoucherCash";

describe("thirdPartyVoucherCash", () => {
  it("maps direction to voucher_type conventions", () => {
    expect(voucherTypeForThirdPartyDirection("received")).toBe("receipt");
    expect(voucherTypeForThirdPartyDirection("paid_out")).toBe("payment");
  });

  it("uses distinct reference types for voucher vs journal consumers", () => {
    expect(THIRD_PARTY_VOUCHER_REFERENCE_TYPE).toBe("third_party");
    expect(THIRD_PARTY_JOURNAL_REFERENCE_TYPE).toBe("ThirdPartyVoucher");
  });

  it("classifies third-party payments into their own outflow bucket", () => {
    expect(
      classifyDailyTallyPaymentOutflow({
        voucher_type: "payment",
        reference_type: "third_party",
      }),
    ).toBe("third_party");
    expect(
      classifyDailyTallyPaymentOutflow({
        voucher_type: "payment",
        reference_type: "supplier",
      }),
    ).toBe("supplier");
    expect(
      classifyDailyTallyPaymentOutflow({
        voucher_type: "expense",
        reference_type: "expense",
      }),
    ).toBe("expense");
  });

  it("does not treat third-party payments as operating expenses for P&L voucher fetches", () => {
    expect(
      isOperatingExpenseVoucher({
        voucher_type: "payment",
        reference_type: "third_party",
      }),
    ).toBe(false);
    expect(
      isOperatingExpenseVoucher({
        voucher_type: "expense",
        reference_type: "expense",
      }),
    ).toBe(true);
  });

  it("derives payment_method from cash/bank ledger selection", () => {
    expect(
      paymentMethodFromCashBankAccount({ account_code: "1000", account_name: "Cash in Hand" }),
    ).toBe("cash");
    expect(
      paymentMethodFromCashBankAccount({ account_code: "1010", account_name: "Bank Account" }),
    ).toBe("bank_transfer");
  });

  it("third-party receipts are not invoice-linked sale receipts (count in full in receipt bucket)", () => {
    expect(isInvoiceLinkedSaleReceipt("third_party")).toBe(false);
    expect(isInvoiceLinkedSaleReceipt("sale")).toBe(true);
  });
});

describe("thirdPartyVoucher GL source of truth", () => {
  it("trial balance helper does not read voucher_entries", async () => {
    const { calculateGlTrialBalance } = await import("@/utils/accountingReportUtils");
    const src = calculateGlTrialBalance.toString();
    expect(src).toContain("calculateGlTrialBalanceForRange");
    expect(src).not.toContain("voucher_entries");
  });

  it("operating expense voucher classification excludes third_party payments", () => {
    expect(
      isOperatingExpenseVoucher({
        voucher_type: "payment",
        reference_type: "third_party",
      }),
    ).toBe(false);
  });
});
