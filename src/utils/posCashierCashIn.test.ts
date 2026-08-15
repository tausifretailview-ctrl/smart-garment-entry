import { describe, expect, it } from "vitest";
import { reconcileSaleInvoiceWithSplit } from "@/utils/customerBalanceUtils";
import { reduceCashierCashIn } from "@/utils/posCashierCashIn";

/**
 * POS/26-27/1248 shape: net 5300, counter cash 900, dashboard balance receipt 4400.
 * Before fix: tenders bumped to 5300 AND receipt 4400 → cash-in overstates by 4400.
 * After fix: tenders stay 900 + receipt 4400 → cash-in 5300; client sync paid 5300.
 */
describe("POS Dashboard dual-write / cash-in (Phase 0 fixtures)", () => {
  const net = 5300;
  const counterCash = 900;
  const balanceReceipt = 4400;

  it("before fix: dual-written tenders + receipt overstate totalCashIn", () => {
    const { cashSale, receiptCash, totalCashIn } = reduceCashierCashIn({
      sales: [
        {
          payment_method: "cash",
          payment_status: "completed",
          sale_number: "POS/26-27/1248",
          net_amount: net,
          cash_amount: counterCash + balanceReceipt, // bumped by dashboard
        },
      ],
      receipts: [
        {
          voucher_type: "receipt",
          total_amount: balanceReceipt,
          payment_method: "cash",
          reference_type: "sale",
          description: "Payment received for POS sale POS/26-27/1248",
        },
      ],
    });
    expect(cashSale).toBe(5300);
    expect(receiptCash).toBe(4400);
    expect(totalCashIn).toBe(9700); // overlap exposed
  });

  it("after fix: counter tender + balance receipt = net with no overlap", () => {
    const { cashSale, receiptCash, totalCashIn } = reduceCashierCashIn({
      sales: [
        {
          payment_method: "cash",
          payment_status: "completed",
          sale_number: "POS/26-27/1248",
          net_amount: net,
          cash_amount: counterCash, // billing-time only
        },
      ],
      receipts: [
        {
          voucher_type: "receipt",
          total_amount: balanceReceipt,
          payment_method: "cash",
          reference_type: "sale",
          description: "Payment received for POS sale POS/26-27/1248",
        },
      ],
    });
    expect(cashSale).toBe(900);
    expect(receiptCash).toBe(4400);
    expect(totalCashIn).toBe(5300);
  });

  it("client syncSalePaymentFromVouchers math: tender 900 + receipt 4400 → paid 5300", () => {
    const rec = reconcileSaleInvoiceWithSplit(
      {
        net_amount: net,
        paid_amount: counterCash,
        cash_amount: counterCash,
        card_amount: 0,
        upi_amount: 0,
        sale_return_adjust: 0,
      },
      { cash: balanceReceipt, adv: 0, cn: 0, discount: 0 },
    );
    expect(rec.paid_amount).toBe(5300);
    expect(rec.payment_status).toBe("completed");
    expect(rec.outstanding).toBe(0);
  });

  it("dual-written tenders 5300 + receipt 4400 still clamp paid to net (cap load-bearing)", () => {
    const rec = reconcileSaleInvoiceWithSplit(
      {
        net_amount: net,
        paid_amount: net,
        cash_amount: counterCash + balanceReceipt,
        card_amount: 0,
        upi_amount: 0,
        sale_return_adjust: 0,
      },
      { cash: balanceReceipt, adv: 0, cn: 0, discount: 0 },
    );
    expect(rec.paid_amount).toBe(5300);
    expect(rec.payment_status).toBe("completed");
  });
});
