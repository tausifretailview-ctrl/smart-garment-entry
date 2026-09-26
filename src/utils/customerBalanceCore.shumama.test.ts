import { describe, expect, it } from "vitest";
import {
  computeCustomerBalanceCore,
  computePendingStandaloneSaleReturns,
  computeRefundedStandaloneSaleReturnCredit,
  getCustomerAccountState,
} from "./customerBalanceCore";

/** ELLA NOOR Shumama Baireli — pending SRs must not consume global SRA pool. */
describe("computePendingStandaloneSaleReturns", () => {
  it("credits full net for unlinked pending rows (no global sraPool)", () => {
    const sales = [
      { id: "inv-803", sale_return_adjust: 38000 },
      { id: "inv-167", sale_return_adjust: 2150 },
    ];
    const saleReturns = [
      { net_amount: 11100, credit_status: "pending", linked_sale_id: null },
      { net_amount: 11400, credit_status: "pending", linked_sale_id: null },
      { net_amount: 10950, credit_status: "pending", linked_sale_id: null },
    ];
    expect(computePendingStandaloneSaleReturns(saleReturns, sales)).toBe(33450);
  });

  it("offsets only linked invoice SRA", () => {
    const sales = [{ id: "sale-a", sale_return_adjust: 5000 }];
    const saleReturns = [
      { net_amount: 8000, credit_status: "pending", linked_sale_id: "sale-a" },
    ];
    expect(computePendingStandaloneSaleReturns(saleReturns, sales)).toBe(3000);
  });

  it("does not put refunded / cash_refund rows in the unclaimed CN pool", () => {
    const sales = [{ id: "inv-1752", sale_return_adjust: 0 }];
    const saleReturns = [
      {
        net_amount: 3250,
        credit_status: "refunded",
        refund_type: "cash_refund",
        linked_sale_id: null,
        credit_available_balance: 0,
      },
    ];
    expect(computePendingStandaloneSaleReturns(saleReturns, sales)).toBe(0);
    expect(computeRefundedStandaloneSaleReturnCredit(saleReturns, sales)).toBe(3250);
  });

  it("refunded credit uses net − linked SRA, not cleared CAB", () => {
    const sales = [{ id: "inv-a", sale_return_adjust: 1000 }];
    const saleReturns = [
      {
        net_amount: 3250,
        credit_status: "refunded",
        refund_type: "cash_refund",
        linked_sale_id: "inv-a",
        credit_available_balance: 0,
      },
    ];
    expect(computeRefundedStandaloneSaleReturnCredit(saleReturns, sales)).toBe(2250);
  });
});

describe("computeCustomerBalanceCore — Shumama-shaped fixture", () => {
  it("does not double-count advance in paid_amount as POS drift", () => {
    const result = computeCustomerBalanceCore({
      openingBalance: 0,
      sales: [
        {
          id: "adv-sale",
          net_amount: 510750,
          sale_return_adjust: 40150,
          paid_amount: 400000,
          cash_amount: 0,
          card_amount: 0,
          upi_amount: 0,
          items_gross: 510750,
        },
      ],
      voucherEntries: [],
      customerAdvances: [{ amount: 450000, used_amount: 400000 }],
      advanceRefunds: [],
      saleReturns: [
        { net_amount: 11100, credit_status: "pending", linked_sale_id: null },
        { net_amount: 11400, credit_status: "pending", linked_sale_id: null },
        { net_amount: 10950, credit_status: "pending", linked_sale_id: null },
      ],
    });
    expect(result.paidAmountDrift).toBe(0);
    expect(result.balance).toBeCloseTo(37150, 0);
    expect(result.unusedAdvance).toBeCloseTo(50000, 0);
    expect(result.balance - result.unusedAdvance).toBeCloseTo(-12850, 0);
  });

  it("credits full pending SR (fixes global sraPool under-credit)", () => {
    const result = computeCustomerBalanceCore({
      openingBalance: 0,
      sales: [
        {
          id: "bulk",
          net_amount: 510750,
          sale_return_adjust: 40150,
          paid_amount: 0,
          items_gross: 510750,
        },
      ],
      voucherEntries: [],
      customerAdvances: [{ amount: 450000, used_amount: 400000 }],
      advanceRefunds: [],
      saleReturns: [
        { net_amount: 11100, credit_status: "pending", linked_sale_id: null },
        { net_amount: 11400, credit_status: "pending", linked_sale_id: null },
        { net_amount: 10950, credit_status: "pending", linked_sale_id: null },
      ],
    });
    expect(result.pendingStandaloneSaleReturns).toBe(33450);
    expect(result.balance).toBeCloseTo(37150, 0);
    expect(getCustomerAccountState({
      openingBalance: 0,
      sales: [
        {
          id: "bulk",
          net_amount: 510750,
          sale_return_adjust: 40150,
          paid_amount: 0,
          items_gross: 510750,
        },
      ],
      voucherEntries: [],
      customerAdvances: [{ amount: 450000, used_amount: 400000 }],
      advanceRefunds: [],
      saleReturns: [
        { net_amount: 11100, credit_status: "pending", linked_sale_id: null },
        { net_amount: 11400, credit_status: "pending", linked_sale_id: null },
        { net_amount: 10950, credit_status: "pending", linked_sale_id: null },
      ],
    }).netPosition).toBeCloseTo(-12850, 0);
  });

  it("economic net refund = unused advance + CN − outstanding Dr", () => {
    const unusedAdvance = 50000;
    const cnAvailable = 33450;
    const outstandingDr = 66050;
    const netRefund = Math.max(0, unusedAdvance + cnAvailable - outstandingDr);
    expect(netRefund).toBe(17400);
  });
});

/** ELLA NOOR Siya Kapoor — SR/26-27/39 used on INV/181 SRA but CAB left at 9,700. */
describe("computePendingStandaloneSaleReturns — stale CAB on linked return", () => {
  it("ignores CAB already used by the linked invoice S/R adjust", () => {
    const sales = [
      { id: "inv-181", sale_return_adjust: 12150 },
      { id: "inv-367", sale_return_adjust: 3900 },
    ];
    const saleReturns = [
      { id: "sr-39", net_amount: 9700, credit_status: "adjusted", linked_sale_id: "inv-181", credit_available_balance: 9700, return_date: "2026-05-18" },
      { id: "sr-40", net_amount: 3900, credit_status: "adjusted", linked_sale_id: "inv-367", credit_available_balance: 0, return_date: "2026-05-18" },
    ];
    expect(computePendingStandaloneSaleReturns(saleReturns, sales)).toBe(0);
  });

  it("splits one invoice SRA between two linked returns, oldest first", () => {
    const sales = [{ id: "inv-a", sale_return_adjust: 5000 }];
    const saleReturns = [
      { id: "a", net_amount: 4000, credit_status: "adjusted", linked_sale_id: "inv-a", credit_available_balance: 0, return_date: "2026-05-01" },
      { id: "b", net_amount: 3000, credit_status: "partially_adjusted", linked_sale_id: "inv-a", credit_available_balance: 2000, return_date: "2026-05-02" },
    ];
    expect(computePendingStandaloneSaleReturns(saleReturns, sales)).toBe(2000);
  });

  it("keeps a real remainder on an adjusted return (Hanif bhai)", () => {
    const sales = [{ id: "inv-287", sale_return_adjust: 150 }];
    const saleReturns = [
      { id: "h", net_amount: 3200, credit_status: "adjusted", linked_sale_id: "inv-287", credit_available_balance: 3050 },
    ];
    expect(computePendingStandaloneSaleReturns(saleReturns, sales)).toBe(3050);
  });
});
