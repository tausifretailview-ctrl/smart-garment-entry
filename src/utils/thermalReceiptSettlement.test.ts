import { describe, expect, it } from "vitest";
import {
  normalizeThermalReceiptMoney,
  saleRowThermalTender,
} from "./thermalReceiptSettlement";

describe("thermal receipt money shared by POS, dashboard, and WhatsApp", () => {
  it("POS/26-27/167: S/R covers ₹3,300 and ₹200 is a refund, not balance due", () => {
    expect(
      normalizeThermalReceiptMoney({
        grandTotal: 3300,
        saleReturnAdjust: 3300,
        paidAmount: 0,
        cashPaid: 3300,
        refundCash: 200,
      }),
    ).toMatchObject({
      grandTotal: 0,
      paidAmount: 0,
      cashPaid: 0,
      balanceDue: 0,
      refundCash: 200,
    });
  });

  it("treats a negative net as the refund amount", () => {
    expect(
      normalizeThermalReceiptMoney({
        grandTotal: -200,
        saleReturnAdjust: 3500,
        paidAmount: -200,
        cashPaid: -200,
      }),
    ).toMatchObject({
      grandTotal: 0,
      paidAmount: 0,
      cashPaid: 0,
      balanceDue: 0,
      refundCash: 200,
    });
  });

  it("does not subtract sale-return again when grand is already the payable", () => {
    expect(
      normalizeThermalReceiptMoney({
        grandTotal: 2300,
        saleReturnAdjust: 1000,
        paidAmount: 2300,
        cashPaid: 2300,
      }),
    ).toMatchObject({
      grandTotal: 2300,
      paidAmount: 2300,
      cashPaid: 2300,
      balanceDue: 0,
      refundCash: 0,
    });
  });

  it("keeps a mix split instead of collapsing it into one mode", () => {
    expect(
      normalizeThermalReceiptMoney({
        grandTotal: 2300,
        paidAmount: 2300,
        cashPaid: 1000,
        upiPaid: 1300,
      }),
    ).toMatchObject({
      grandTotal: 2300,
      paidAmount: 2300,
      cashPaid: 1000,
      upiPaid: 1300,
      balanceDue: 0,
    });
  });

  it("keeps a normal cash bill paid in full", () => {
    expect(
      normalizeThermalReceiptMoney({
        grandTotal: 3300,
        paidAmount: 3300,
        cashPaid: 3300,
      }),
    ).toMatchObject({
      grandTotal: 3300,
      paidAmount: 3300,
      cashPaid: 3300,
      balanceDue: 0,
      refundCash: 0,
    });
  });

  it("does not treat the full bill as cash received on a saved exchange", () => {
    expect(
      saleRowThermalTender({
        payment_method: "cash",
        net_amount: 3300,
        paid_amount: 0,
        cash_amount: 0,
      } as { payment_method: string; paid_amount: number; cash_amount: number }),
    ).toEqual({
      cashPaid: 0,
      upiPaid: 0,
      cardPaid: 0,
      creditPaid: 0,
      paidAmount: 0,
    });
  });

  it("cash + credit split keeps the cash handed over and the credit owed", () => {
    expect(
      normalizeThermalReceiptMoney({
        grandTotal: 1000,
        paidAmount: 500,
        cashPaid: 500,
        creditPaid: 500,
      }),
    ).toMatchObject({
      grandTotal: 1000,
      paidAmount: 500,
      cashPaid: 500,
      creditPaid: 500,
      balanceDue: 500,
    });
  });

  it("still clamps a full-bill cash figure back to the amount paid", () => {
    expect(
      normalizeThermalReceiptMoney({ grandTotal: 1000, paidAmount: 400, cashPaid: 1000 }),
    ).toMatchObject({ cashPaid: 400, paidAmount: 400, balanceDue: 600 });
  });
});
