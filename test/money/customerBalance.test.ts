import { describe, expect, it } from "vitest";
import { computeCustomerBalanceCore, getCustomerAccountState } from "@/utils/customerBalanceCore";
import { computeCustomerOutstanding } from "@/utils/customerBalanceUtils";
import { computeNetReceivableFromBalances } from "../helpers/saleDriftCheck";

const ADVANCE_FIXTURE = {
  openingBalance: 0,
  customerId: "cust-1",
  sales: [
    {
      id: "sale-1",
      net_amount: 10000,
      paid_amount: 0,
      cash_amount: 0,
      sale_return_adjust: 0,
    },
  ],
  vouchers: [
    {
      reference_id: "sale-1",
      reference_type: "sale",
      total_amount: 3000,
      discount_amount: 0,
      payment_method: "cash",
    },
    {
      reference_id: "sale-1",
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
  saleReturns: [] as Array<{ net_amount?: number; credit_status?: string; linked_sale_id?: string | null }>,
  refundsPaidTotal: 0,
};

describe("computeCustomerOutstanding — advance application", () => {
  it("advance applied via voucher reduces outstanding exactly once", () => {
    const result = computeCustomerOutstanding(ADVANCE_FIXTURE);

    // REGRESSION: invoice outstanding should be ₹5,000 (10k − 3k cash − 2k advance).
    expect(result.balance).toBeCloseTo(5000, 0);
    expect(result.unusedAdvanceTotal).toBeCloseTo(3000, 0);
  });
});

describe("computeCustomerBalanceCore — advance application", () => {
  it("returns ₹5,000 outstanding (unused advance pool not subtracted)", () => {
    const voucherEntries = ADVANCE_FIXTURE.vouchers.map((v) => ({
      voucher_type: "receipt" as const,
      reference_type: v.reference_type,
      reference_id: v.reference_id,
      total_amount: v.total_amount,
      discount_amount: v.discount_amount,
      payment_method: v.payment_method,
      description: v.description,
    }));

    const core = computeCustomerBalanceCore({
      openingBalance: ADVANCE_FIXTURE.openingBalance,
      customerId: ADVANCE_FIXTURE.customerId,
      sales: ADVANCE_FIXTURE.sales,
      voucherEntries,
      customerAdvances: ADVANCE_FIXTURE.advances,
      advanceRefunds: [],
      adjustmentTotal: ADVANCE_FIXTURE.adjustmentTotal,
      saleReturns: ADVANCE_FIXTURE.saleReturns,
      options: { ledgerAlignedApplicationReceipts: true },
    });

    expect(core.balance).toBeCloseTo(5000, 0);
    expect(core.unusedAdvance).toBeCloseTo(3000, 0);
  });

  it("agrees with computeCustomerOutstanding on the advance fixture", () => {
    const legacy = computeCustomerOutstanding(ADVANCE_FIXTURE);
    const state = getCustomerAccountState({
      openingBalance: ADVANCE_FIXTURE.openingBalance,
      customerId: ADVANCE_FIXTURE.customerId,
      sales: ADVANCE_FIXTURE.sales,
      voucherEntries: ADVANCE_FIXTURE.vouchers.map((v) => ({
        voucher_type: "receipt" as const,
        reference_type: v.reference_type,
        reference_id: v.reference_id,
        total_amount: v.total_amount,
        discount_amount: v.discount_amount,
        payment_method: v.payment_method,
        description: v.description,
      })),
      customerAdvances: ADVANCE_FIXTURE.advances,
      advanceRefunds: [],
      adjustmentTotal: ADVANCE_FIXTURE.adjustmentTotal,
      saleReturns: ADVANCE_FIXTURE.saleReturns,
      options: { ledgerAlignedApplicationReceipts: true },
    });

    expect(state.balance).toBeCloseTo(legacy.balance, 0);
    expect(state.balance).toBeCloseTo(5000, 0);
    expect(state.netPosition).toBeCloseTo(2000, 0);
  });

  it("unchanged when advance is fully used (no unused pool)", () => {
    const result = computeCustomerBalanceCore({
      openingBalance: 0,
      sales: [{ id: "s1", net_amount: 5000, paid_amount: 0 }],
      voucherEntries: [
        {
          voucher_type: "receipt",
          reference_type: "sale",
          reference_id: "s1",
          total_amount: 5000,
          payment_method: "advance_adjustment",
          description: "Adjusted from advance balance",
        },
      ],
      customerAdvances: [{ amount: 5000, used_amount: 5000 }],
      advanceRefunds: [],
      options: { ledgerAlignedApplicationReceipts: true },
    });

    expect(result.balance).toBeCloseTo(0, 0);
    expect(result.unusedAdvance).toBeCloseTo(0, 0);
  });

  it("Zohra-shaped: paid bill + pending SR + overpayment refund → balance 0", () => {
    const result = computeCustomerBalanceCore({
      openingBalance: 0,
      sales: [
        {
          id: "pos-7",
          net_amount: 600,
          paid_amount: 600,
          cash_amount: 0,
          sale_return_adjust: 0,
        },
      ],
      voucherEntries: [
        {
          voucher_type: "receipt",
          reference_type: "sale",
          reference_id: "pos-7",
          total_amount: 600,
          payment_method: "cash",
          description: "Payment received for POS sale",
        },
        {
          voucher_type: "payment",
          reference_type: "customer",
          reference_id: "cust-zohra",
          total_amount: 600,
          payment_method: "cash",
          description: "Overpayment refund to ZOHRA (cash)",
        },
      ],
      customerAdvances: [],
      advanceRefunds: [],
      saleReturns: [
        { net_amount: 600, credit_status: "pending", linked_sale_id: "pos-7" },
      ],
      additionalCustomerPaymentDebits: 0,
      options: { ledgerAlignedApplicationReceipts: true },
    });

    expect(result.pendingStandaloneSaleReturns).toBeCloseTo(600, 0);
    expect(result.customerPaymentDebits).toBeCloseTo(600, 0);
    expect(result.balance).toBeCloseTo(0, 0);
  });

  it("Hanif bhai — adjusted return remainder shows 3050 Cr not 3200 Dr", () => {
    const settled = computeCustomerBalanceCore({
      openingBalance: 0,
      sales: [
        {
          id: "inv-287",
          net_amount: 3200,
          paid_amount: 0,
          sale_return_adjust: 3200,
          items_gross: 3200,
        },
      ],
      voucherEntries: [],
      customerAdvances: [],
      advanceRefunds: [],
      saleReturns: [
        {
          net_amount: 6250,
          credit_status: "adjusted",
          linked_sale_id: "inv-287",
          credit_available_balance: 3050,
        },
      ],
      options: { ledgerAlignedApplicationReceipts: true },
    });
    expect(settled.balance).toBeCloseTo(-3050, 0);
    expect(settled.pendingStandaloneSaleReturns).toBeCloseTo(3050, 0);
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
