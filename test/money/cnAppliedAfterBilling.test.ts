import { describe, expect, it } from "vitest";
import { computeCustomerBalanceCore } from "@/utils/customerBalanceCore";

// KS Footwear / Soni Shoes: CN of 2,390 applied to an existing invoice AFTER billing.
// net_amount stays the full bill; the bill is discounted below MRP so items_gross (qty x MRP) is far
// above net + sra, which used to make the balance treat the CN as already baked into net.
const baseSale = {
  id: "inv-1184",
  net_amount: 14141,
  paid_amount: 0,
  cash_amount: 0,
  card_amount: 0,
  upi_amount: 0,
  sale_return_adjust: 2390,
  payment_status: "partial",
  is_cancelled: false,
  items_gross: 20000, // MRP basis, well above net + sra
};

const params = (sale: Record<string, unknown>) => ({
  openingBalance: 0,
  customerId: "cust-1",
  sales: [sale] as never,
  voucherEntries: [] as never,
  customerAdvances: [] as never,
  advanceRefunds: [] as never,
  adjustmentTotal: 0,
  saleReturns: [] as never,
});

describe("CN applied after billing on a discounted bill", () => {
  it("reduces the balance once when bill header fields are loaded", () => {
    const withHeader = {
      ...baseSale,
      gross_amount: 15500,
      discount_amount: 1359, // 15,500 - 1,359 = 14,141 = full bill, CN not baked into net
      flat_discount_amount: 0,
      points_redeemed_amount: 0,
      round_off: 0,
    };
    expect(computeCustomerBalanceCore(params(withHeader)).balance).toBe(14141 - 2390);
  });

  it("documents why the header fields are required: without them the CN is lost", () => {
    expect(computeCustomerBalanceCore(params(baseSale)).balance).toBe(14141);
  });

  it("still treats a CN baked into net as applied once", () => {
    const baked = {
      ...baseSale,
      net_amount: 11751, // return already taken off the bill
      gross_amount: 15500,
      discount_amount: 1359,
      flat_discount_amount: 0,
      points_redeemed_amount: 0,
      round_off: 0,
    };
    expect(computeCustomerBalanceCore(params(baked)).balance).toBe(11751);
  });
});
