import { describe, expect, it } from "vitest";
import { reconcileSaleInvoiceWithSplit } from "@/utils/customerBalanceUtils";
import {
  createSameDaySaleReceiptOverlapTracker,
  reduceCashierCashIn,
} from "@/utils/posCashierCashIn";

const SALE_ID = "sale-1248";

/**
 * POS/26-27/1248 shape: net 5300, counter cash 900, dashboard balance receipt 4400.
 */
describe("POS Dashboard dual-write / cash-in", () => {
  const net = 5300;
  const counterCash = 900;
  const balanceReceipt = 4400;

  it("before fix (dual-written tenders): overlap strips Old Balance double-count", () => {
    const { cashSale, receiptCash, totalCashIn } = reduceCashierCashIn({
      sales: [
        {
          id: SALE_ID,
          payment_method: "cash",
          payment_status: "completed",
          sale_number: "POS/26-27/1248",
          net_amount: net,
          cash_amount: counterCash + balanceReceipt,
        },
      ],
      receipts: [
        {
          voucher_type: "receipt",
          total_amount: balanceReceipt,
          payment_method: "cash",
          reference_type: "sale",
          reference_id: SALE_ID,
          description: "Payment received for POS sale POS/26-27/1248",
        },
      ],
    });
    expect(cashSale).toBe(5300);
    expect(receiptCash).toBe(0);
    expect(totalCashIn).toBe(5300);
  });

  it("after Phase 1: counter tender + balance receipt = net with no strip", () => {
    const { cashSale, receiptCash, totalCashIn } = reduceCashierCashIn({
      sales: [
        {
          id: SALE_ID,
          payment_method: "cash",
          payment_status: "completed",
          sale_number: "POS/26-27/1248",
          net_amount: net,
          cash_amount: counterCash,
        },
      ],
      receipts: [
        {
          voucher_type: "receipt",
          total_amount: balanceReceipt,
          payment_method: "cash",
          reference_type: "sale",
          reference_id: SALE_ID,
          description: "Payment received for POS sale POS/26-27/1248",
        },
      ],
    });
    expect(cashSale).toBe(900);
    expect(receiptCash).toBe(4400);
    expect(totalCashIn).toBe(5300);
  });

  it("prior-day sale receipt (not in today's sales) still counts as Old Balance", () => {
    const tracker = createSameDaySaleReceiptOverlapTracker(
      [],
      [
        {
          voucher_type: "receipt",
          total_amount: 4400,
          reference_type: "sale",
          reference_id: "old-sale",
        },
      ],
    );
    expect(
      tracker.countableAmount({
        voucher_type: "receipt",
        total_amount: 4400,
        reference_type: "sale",
        reference_id: "old-sale",
      }),
    ).toBe(4400);
  });

  it("true customer OB receipt always counts", () => {
    const tracker = createSameDaySaleReceiptOverlapTracker(
      [
        {
          id: SALE_ID,
          net_amount: net,
          cash_amount: net,
          card_amount: 0,
          upi_amount: 0,
        },
      ],
      [
        {
          voucher_type: "receipt",
          total_amount: 1000,
          reference_type: "customer",
          reference_id: "cust-1",
        },
      ],
    );
    expect(
      tracker.countableAmount({
        voucher_type: "receipt",
        total_amount: 1000,
        reference_type: "customer",
        reference_id: "cust-1",
      }),
    ).toBe(1000);
  });

  it("client sync: tender 900 + receipt 4400 → paid 5300", () => {
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
});
