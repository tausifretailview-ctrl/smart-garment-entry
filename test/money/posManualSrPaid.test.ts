import { describe, expect, it } from "vitest";
import { reconcileSaleInvoiceWithSplit } from "@/utils/customerBalanceUtils";

// POS/26-27/210 (HASAN): bill 6,900 - 1,050 discount = 5,850, manual old S/R amount 1,600,
// cash 4,250. POS Dashboard rows have no items_gross and an amount-only S/R has no CN voucher.
const header = {
  gross_amount: 6900,
  discount_amount: 1050,
  flat_discount_amount: 0,
  points_redeemed_amount: 0,
  round_off: 0,
};

const sale = (net: number, paid: number) => ({
  net_amount: net,
  sale_return_adjust: 1600,
  paid_amount: paid,
  cash_amount: paid,
  card_amount: 0,
  upi_amount: 0,
  ...header,
});

describe("POS bill with a manual old S/R amount", () => {
  it("net is the full bill (5,850), cash 4,250 + S/R 1,600 settles it: paid, nothing pending", () => {
    const rec = reconcileSaleInvoiceWithSplit(sale(5850, 4250), null);
    expect(rec.outstanding).toBe(0);
    expect(rec.payment_status).toBe("completed");
  });

  it("S/R already taken off net (4,250): still settled, S/R not deducted twice", () => {
    const rec = reconcileSaleInvoiceWithSplit(sale(4250, 4250), null);
    expect(rec.outstanding).toBe(0);
    expect(rec.payment_status).toBe("completed");
  });

  it("only 3,000 paid on the full-bill shape leaves 1,250 pending, partial", () => {
    const rec = reconcileSaleInvoiceWithSplit(sale(5850, 3000), null);
    expect(rec.outstanding).toBe(1250);
    expect(rec.payment_status).toBe("partial");
  });
});
