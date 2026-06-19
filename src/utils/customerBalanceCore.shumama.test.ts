import { describe, expect, it } from "vitest";
import {
  computeCustomerBalanceCore,
  computePendingStandaloneSaleReturns,
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
    expect(result.balance).toBeGreaterThan(-20000);
    expect(result.balance).toBeLessThan(-10000);
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
    expect(result.balance).toBe(-12850);
  });

  it("economic net refund = unused advance + CN − outstanding Dr", () => {
    const unusedAdvance = 50000;
    const cnAvailable = 33450;
    const outstandingDr = 66050;
    const netRefund = Math.max(0, unusedAdvance + cnAvailable - outstandingDr);
    expect(netRefund).toBe(17400);
  });
});
