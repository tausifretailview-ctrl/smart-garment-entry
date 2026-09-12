import { describe, expect, it } from "vitest";
import {
  isSaleReturnRefundPaymentVoucher,
  sumCashierSaleReturnRefunds,
} from "./cashierSaleReturnRefunds";

describe("sumCashierSaleReturnRefunds", () => {
  it("counts standalone cash_refund when sales.refund_amount is unused", () => {
    const summed = sumCashierSaleReturnRefunds([
      { refund_type: "cash_refund", payment_method: "cash", net_amount: 1500 },
      { refund_type: "credit_note", payment_method: null, net_amount: 800 },
      { refund_type: "exchange", payment_method: null, net_amount: 200 },
    ]);
    expect(summed.refundTotal).toBe(1500);
    expect(summed.cashOut).toBe(1500);
    expect(summed.upiOut).toBe(0);
  });

  it("splits cash_refund by payment_method (UPI/card stay off Cash Out)", () => {
    const summed = sumCashierSaleReturnRefunds([
      { refund_type: "cash_refund", payment_method: "cash", net_amount: 1500 },
      { refund_type: "cash_refund", payment_method: "upi", net_amount: 400 },
      { refund_type: "cash_refund", payment_method: "card", net_amount: 100 },
    ]);
    expect(summed.refundTotal).toBe(2000);
    expect(summed.cashOut).toBe(1500);
    expect(summed.upiOut).toBe(400);
    expect(summed.cardOut).toBe(100);
  });

  it("treats missing payment_method on cash_refund as cash", () => {
    const summed = sumCashierSaleReturnRefunds([
      { refund_type: "cash_refund", payment_method: null, net_amount: 1500 },
    ]);
    expect(summed.refundTotal).toBe(1500);
    expect(summed.cashOut).toBe(1500);
  });
});

describe("isSaleReturnRefundPaymentVoucher", () => {
  it("matches the standalone S/R payment voucher description", () => {
    expect(
      isSaleReturnRefundPaymentVoucher({
        description: "Refund paid for sale return: SR/26-27/32",
      }),
    ).toBe(true);
  });

  it("does not match POS exchange refund vouchers", () => {
    expect(
      isSaleReturnRefundPaymentVoucher({
        description: "Refund paid for POS exchange POS/26-27/10",
      }),
    ).toBe(false);
  });
});
