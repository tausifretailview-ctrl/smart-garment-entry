import { describe, expect, it } from "vitest";
import {
  printBillNetAmount,
  saleBillFigures,
  saleInvoicePrintAccountOpts,
  saleReceivableAfterTender,
  saleRefundForPrint,
  saleRefundForReprint,
} from "./saleBillFigures";

describe("sale bill figures for old and Rule B rows", () => {
  it("CN ₹250 on a ₹250 Rule B bill: bill 250, payable 0", () => {
    const figures = saleBillFigures({
      gross_amount: 250,
      discount_amount: 0,
      net_amount: 250,
      sale_return_adjust: 250,
      paid_amount: 0,
    });
    expect(figures.baked).toBe(false);
    expect(figures.billAmount).toBe(250);
    expect(figures.payable).toBe(0);
    expect(saleReceivableAfterTender({
      gross_amount: 250,
      net_amount: 250,
      sale_return_adjust: 250,
      paid_amount: 0,
    })).toBe(0);
  });

  it("CN ₹500 on an ₹800 bill with ₹300 cash", () => {
    const sale = {
      gross_amount: 800,
      discount_amount: 0,
      net_amount: 800,
      sale_return_adjust: 500,
      paid_amount: 300,
    };
    const figures = saleBillFigures(sale);
    expect(figures.billAmount).toBe(800);
    expect(figures.payable).toBe(300);
    expect(saleReceivableAfterTender(sale)).toBe(0);
  });

  it("old baked POS bill does not subtract sale-return a second time", () => {
    const sale = {
      gross_amount: 3000,
      discount_amount: 600,
      net_amount: 1400,
      sale_return_adjust: 1000,
      paid_amount: 200,
      round_off: 0,
    };
    const figures = saleBillFigures(sale);
    expect(figures.baked).toBe(true);
    expect(figures.billAmount).toBe(2400);
    expect(figures.payable).toBe(1400);
    expect(saleReceivableAfterTender(sale)).toBe(1200);
  });

  it("print uses the bill when it is passed, and does not rebuild grand total", () => {
    expect(printBillNetAmount({
      grandTotal: 0,
      saleReturnAdjust: 250,
      billNetAmount: 250,
    })).toBe(250);
    expect(printBillNetAmount({
      grandTotal: 300,
      saleReturnAdjust: 500,
      billNetAmount: 800,
    })).toBe(800);
  });
});

describe("saleInvoicePrintAccountOpts", () => {
  it("a covered return is not treated as ₹3,300 still due on this bill", () => {
    expect(
      saleInvoicePrintAccountOpts({
        net_amount: 3300,
        sale_return_adjust: 3300,
        paid_amount: 0,
      }),
    ).toEqual({
      billTotal: 0,
      receivedToday: 0,
      accountIncludesThisBill: true,
    });
  });

  it("uses payable and the cash actually received", () => {
    expect(
      saleInvoicePrintAccountOpts({
        gross_amount: 3300,
        net_amount: 3300,
        sale_return_adjust: 1000,
        paid_amount: 2300,
      }),
    ).toEqual({
      billTotal: 2300,
      receivedToday: 2300,
      accountIncludesThisBill: true,
    });
  });
});

describe("saleRefundForPrint (reprint of an exchange refund)", () => {
  it("returns the saved refund so the reprint can show Refund to Customer", () => {
    expect(saleRefundForPrint({ refund_amount: 450 })).toBe(450);
    expect(saleRefundForPrint({ refund_amount: 449.996 })).toBe(450);
  });

  it("is 0 when nothing was refunded or the value is missing or negative", () => {
    expect(saleRefundForPrint({ refund_amount: 0 })).toBe(0);
    expect(saleRefundForPrint({ refund_amount: null })).toBe(0);
    expect(saleRefundForPrint({})).toBe(0);
    expect(saleRefundForPrint({ refund_amount: -30 })).toBe(0);
  });
});

describe("saleRefundForReprint", () => {
  it("uses the saved refund when present", () => {
    expect(saleRefundForReprint({ refund_amount: 798 }, 500)).toBe(798);
  });
  it("falls back to the refund voucher when the column is empty", () => {
    expect(saleRefundForReprint({ refund_amount: 0 }, 798)).toBe(798);
    expect(saleRefundForReprint({ refund_amount: null }, 798.004)).toBe(798);
  });
  it("is 0 when neither exists", () => {
    expect(saleRefundForReprint({ refund_amount: 0 })).toBe(0);
    expect(saleRefundForReprint({}, -5)).toBe(0);
  });
});
