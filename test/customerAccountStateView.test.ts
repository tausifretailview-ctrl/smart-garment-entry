import { describe, expect, it } from "vitest";
import {
  formatAccountInr,
  formatCustomerAccountArithmeticLine,
  formatNetPositionLabel,
  type CustomerAccountStateView,
} from "../src/utils/customerAccountStateView";
import { getCustomerAccountState } from "../src/utils/customerBalanceCore";

describe("customerAccountStateView formatting", () => {
  const parishmaLike: CustomerAccountStateView = {
    customerId: "c1",
    customerName: "PARISHMA MEMON",
    outstanding: 6300,
    unusedAdvance: 3740,
    unclaimedSaleReturn: 0,
    netPosition: 2560,
    openingBalance: 0,
    advanceLegs: [
      { id: "a1", advanceNumber: "ADV/26-27/361", remaining: 590, amount: 1000, usedAmount: 410 },
      { id: "a2", advanceNumber: "ADV/648", remaining: 1750, amount: 1750, usedAmount: 0 },
      { id: "a3", advanceNumber: "ADV/652", remaining: 1400, amount: 1400, usedAmount: 0 },
    ],
  };

  it("formats Parishma-style arithmetic identically for all surfaces", () => {
    const line = formatCustomerAccountArithmeticLine(parishmaLike);
    expect(line).toBe(
      "Customer owes ₹6,300  −  Advance held ₹3,740  =  Net ₹2,560 Dr",
    );
  });

  it("appends unclaimed returns without changing the subtraction", () => {
    const line = formatCustomerAccountArithmeticLine({
      ...parishmaLike,
      unclaimedSaleReturn: 500,
    });
    expect(line).toContain("=  Net ₹2,560 Dr");
    expect(line).toContain("Unclaimed returns ₹500");
    expect(line).not.toMatch(/−\s*Unclaimed/);
  });

  it("labels Cr when net is credit", () => {
    expect(formatNetPositionLabel(-1200)).toBe("₹1,200 Cr");
    expect(formatAccountInr(-1200)).toBe("₹1,200");
  });
});

describe("getCustomerAccountState facets (no parallel maths)", () => {
  it("keeps unused advance out of outstanding and nets it only in netPosition", () => {
    const state = getCustomerAccountState({
      openingBalance: 0,
      customerId: "c1",
      sales: [
        {
          id: "s1",
          net_amount: 6300,
          paid_amount: 0,
          sale_return_adjust: 0,
          items_gross: 6300,
        },
      ],
      voucherEntries: [],
      customerAdvances: [{ amount: 3740, used_amount: 0 }],
      advanceRefunds: [],
      saleReturns: [],
      options: { ledgerAlignedApplicationReceipts: true },
    });

    expect(state.outstanding).toBe(6300);
    expect(state.unusedAdvancePool).toBe(3740);
    expect(state.netPosition).toBe(2560);
    expect(state.unclaimedSaleReturnCredit).toBe(0);
  });

  it("includes opening balance inside outstanding", () => {
    const state = getCustomerAccountState({
      openingBalance: 1000,
      customerId: "c1",
      sales: [
        {
          id: "s1",
          net_amount: 2000,
          paid_amount: 0,
          sale_return_adjust: 0,
          items_gross: 2000,
        },
      ],
      voucherEntries: [],
      customerAdvances: [],
      advanceRefunds: [],
      saleReturns: [],
      options: { ledgerAlignedApplicationReceipts: true },
    });

    expect(state.outstanding).toBe(3000);
    expect(state.openingBalance).toBe(1000);
    expect(state.netPosition).toBe(3000);
  });

  it("surfaces unclaimed sale returns separately from unused advance", () => {
    const state = getCustomerAccountState({
      openingBalance: 0,
      customerId: "c1",
      sales: [
        {
          id: "s1",
          net_amount: 5000,
          paid_amount: 0,
          sale_return_adjust: 0,
          items_gross: 5000,
        },
      ],
      voucherEntries: [],
      customerAdvances: [{ amount: 1000, used_amount: 0 }],
      advanceRefunds: [],
      saleReturns: [
        {
          net_amount: 400,
          credit_status: "pending",
          linked_sale_id: null,
        },
      ],
      options: { ledgerAlignedApplicationReceipts: true },
    });

    expect(state.unusedAdvancePool).toBe(1000);
    expect(state.unclaimedSaleReturnCredit).toBe(400);
    // Outstanding already nets unclaimed SR; advance stays separate.
    expect(state.outstanding).toBe(4600);
    expect(state.netPosition).toBe(3600);
  });

  it("Farhaan Fab — partial CN ₹2,800 with ₹2,700 applied → net Cr ₹100", () => {
    const state = getCustomerAccountState({
      openingBalance: 0,
      customerId: "farhaan",
      sales: [
        { id: "inv-a", net_amount: 11800, paid_amount: 11800, sale_return_adjust: 0, items_gross: 11800 },
        { id: "inv-b", net_amount: 2800, paid_amount: 2800, sale_return_adjust: 0, items_gross: 2800 },
        { id: "inv-c", net_amount: 2700, paid_amount: 0, sale_return_adjust: 2700, items_gross: 2700 },
      ],
      voucherEntries: [
        { voucher_type: "receipt", reference_type: "sale", reference_id: "inv-a", total_amount: 11800, discount_amount: 0, payment_method: "cash" },
        { voucher_type: "receipt", reference_type: "sale", reference_id: "inv-b", total_amount: 1700, discount_amount: 0, payment_method: "cash" },
        { voucher_type: "receipt", reference_type: "sale", reference_id: "inv-b", total_amount: 1100, discount_amount: 0, payment_method: "cash" },
      ],
      customerAdvances: [],
      advanceRefunds: [],
      saleReturns: [
        {
          net_amount: 2800,
          credit_status: "partially_adjusted",
          credit_available_balance: 100,
        },
      ],
      options: { ledgerAlignedApplicationReceipts: true },
    });
    expect(state.netPosition).toBeCloseTo(-100, 0);
    expect(state.unclaimedSaleReturnCredit).toBeCloseTo(100, 0);
  });
});
