import { describe, expect, it } from "vitest";
import { reconcileSaleInvoiceWithSplit } from "@/utils/customerBalanceUtils";

// VAVIA SHOES-MALAD E (KS Footwear): receipts carried a settlement discount that was counted twice.
const sale = (net: number, paid: number) => ({
  net_amount: net,
  paid_amount: paid,
  sale_return_adjust: 0,
  cash_amount: 0,
  card_amount: 0,
  upi_amount: 0,
});
const split = (cash: number, discount: number) => ({ cash, cn: 0, adv: 0, discount });

describe("receipt settlement discount is counted once", () => {
  it("INV/25-26/746: cash 15,339 + discount 1,007 on a 19,367 bill leaves 3,021 pending", () => {
    const rec = reconcileSaleInvoiceWithSplit(sale(19367, 16346), split(15339, 1007));
    expect(rec.outstanding).toBe(3021);
    expect(rec.payment_status).toBe("partial");
  });

  it("INV/25-26/825: cash 3,717 + discount 127 on a 4,225 bill leaves 381 pending", () => {
    const rec = reconcileSaleInvoiceWithSplit(sale(4225, 3844), split(3717, 127));
    expect(rec.outstanding).toBe(381);
    expect(rec.payment_status).toBe("partial");
  });

  it("partly paid with a discount: 1,000 bill, 500 cash + 100 discount leaves 400", () => {
    const rec = reconcileSaleInvoiceWithSplit(sale(1000, 600), split(500, 100));
    expect(rec.outstanding).toBe(400);
    expect(rec.payment_status).toBe("partial");
  });

  it("fully settled by cash + discount stays completed", () => {
    const rec = reconcileSaleInvoiceWithSplit(sale(1000, 1000), split(900, 100));
    expect(rec.outstanding).toBe(0);
    expect(rec.payment_status).toBe("completed");
  });

  it("documents the remaining data problem: a stale stored paid_amount equal to the bill is trusted", () => {
    // Current production state of INV/25-26/746: paid_amount = 19,367 with only 16,346 of vouchers.
    // Needs the data repair (set paid_amount to what the vouchers support); the code cannot tell
    // this apart from a genuine legacy payment recorded outside vouchers.
    const rec = reconcileSaleInvoiceWithSplit(sale(19367, 19367), split(15339, 1007));
    expect(rec.outstanding).toBe(0);
  });
});
