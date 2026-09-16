import { describe, expect, it } from "vitest";
import {
  buildCashierReceiptModeMap,
  getCashierSalePaymentModeAmounts,
  sumCashierModeAmounts,
} from "./cashierSaleModeAmounts";

describe("getCashierSalePaymentModeAmounts", () => {
  it("gap-fills zero-tender mix bill from paid_amount into card", () => {
    const modes = getCashierSalePaymentModeAmounts({
      payment_method: "multiple",
      net_amount: 161136,
      paid_amount: 161136,
      cash_amount: 0,
      card_amount: 0,
      upi_amount: 0,
    });
    expect(modes.cash).toBe(0);
    expect(modes.card).toBe(161136);
    expect(modes.upi).toBe(0);
  });

  it("merges receipt voucher modes before gap-fill on mix bills", () => {
    const sale = {
      id: "s1",
      payment_method: "multiple",
      net_amount: 50000,
      paid_amount: 50000,
      cash_amount: 0,
      card_amount: 0,
      upi_amount: 0,
    };
    const modes = getCashierSalePaymentModeAmounts(sale, {
      cash: 20000,
      card: 0,
      upi: 30000,
    });
    expect(modes.cash).toBe(20000);
    expect(modes.upi).toBe(30000);
    expect(modes.card).toBe(0);
    expect(sumCashierModeAmounts(modes)).toBe(50000);
  });

  it("returns zero modes for pay_later", () => {
    expect(
      getCashierSalePaymentModeAmounts({
        payment_method: "pay_later",
        net_amount: 1000,
        paid_amount: 0,
      }),
    ).toEqual({ cash: 0, card: 0, upi: 0 });
  });
});

describe("buildCashierReceiptModeMap", () => {
  it("maps sale-linked receipt rows by payment method", () => {
    const map = buildCashierReceiptModeMap(
      [{ id: "s1", sale_number: "POS/26-27/1" }],
      [
        {
          reference_id: "s1",
          reference_type: "sale",
          total_amount: 1000,
          payment_method: "upi",
        },
      ],
    );
    expect(map.get("s1")).toEqual({ cash: 0, card: 0, upi: 1000 });
  });
});
