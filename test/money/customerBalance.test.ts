import { describe, expect, it } from "vitest";
import { computeCustomerOutstanding } from "@/utils/customerBalanceUtils";
import { computeNetReceivableFromBalances } from "../helpers/saleDriftCheck";

describe("computeCustomerOutstanding — advance application", () => {
  it("advance applied via voucher reduces outstanding exactly once", () => {
    const customerId = "cust-1";
    const saleId = "sale-1";
    const result = computeCustomerOutstanding({
      openingBalance: 0,
      customerId,
      sales: [
        {
          id: saleId,
          net_amount: 10000,
          paid_amount: 0,
          cash_amount: 0,
          sale_return_adjust: 0,
        },
      ],
      vouchers: [
        {
          reference_id: saleId,
          reference_type: "sale",
          total_amount: 3000,
          discount_amount: 0,
          payment_method: "cash",
        },
        {
          reference_id: saleId,
          reference_type: "sale",
          total_amount: 2000,
          discount_amount: 0,
          payment_method: "advance_adjustment",
          description: "Adjusted from advance balance for invoice",
        },
      ],
      adjustmentTotal: 0,
      advances: [{ id: "adv-1", amount: 5000, used_amount: 2000 }],
      advanceRefundTotal: 0,
      saleReturns: [],
      refundsPaidTotal: 0,
    });

    // REGRESSION: invoice outstanding should be ₹5,000 (10k − 3k cash − 2k advance).
    // If balance is ₹2,000, unused advance pool may be over-subtracted — see Shumama fix.
    expect(result.balance).toBeCloseTo(5000, 0);
    expect(result.unusedAdvanceTotal).toBeCloseTo(3000, 0);
  });
});

describe("net receivable = gross outstanding − credit pool", () => {
  it("matches CustomerLedger rollup with mixed Dr/Cr customers", () => {
    const balances = [50000, 12000, -8000, -15000, 0];
    expect(computeNetReceivableFromBalances(balances)).toBe(62000 - 23000);
    expect(computeNetReceivableFromBalances(balances)).toBe(39000);
  });

  it("credit-only customer reduces net receivable", () => {
    expect(computeNetReceivableFromBalances([-419000])).toBe(-419000);
  });
});
