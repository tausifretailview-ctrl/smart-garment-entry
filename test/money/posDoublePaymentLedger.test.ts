import { describe, expect, it } from "vitest";
import {
  buildAuditRows,
  residualPaymentAtSaleTender,
  residualTenderBreakdown,
  salePaidAtSaleTender,
} from "@/utils/customerAuditBundle";

describe("POS payment-at-sale vs receipt double-count", () => {
  it("residual is zero when RCP covers full tender", () => {
    const sale = { cash_amount: 1000, card_amount: 0, upi_amount: 0 };
    expect(salePaidAtSaleTender(sale)).toBe(1000);
    expect(residualPaymentAtSaleTender(sale, 1000)).toBe(0);
    expect(residualPaymentAtSaleTender(sale, 500)).toBe(500);
  });

  it("residual breakdown allocates cash then card then upi", () => {
    const sale = { cash_amount: 600, card_amount: 300, upi_amount: 100 };
    expect(residualTenderBreakdown(sale, 700)).toEqual({
      cash: 600,
      card: 100,
      upi: 0,
    });
  });

  it("buildAuditRows credits tender only once when POS has payment at sale + RCP", () => {
    const rows = buildAuditRows({
      sales: [
        {
          id: "sale-pos-3",
          sale_number: "POS/26-27/3",
          sale_date: "2026-08-11",
          net_amount: 1000,
          paid_amount: 1000,
          cash_amount: 1000,
          card_amount: 0,
          upi_amount: 0,
          sale_return_adjust: 0,
          payment_status: "completed",
        },
      ],
      saleReturns: [],
      vouchers: [
        {
          id: "rcp-3677",
          voucher_type: "receipt",
          voucher_number: "RCP/26-27/3677",
          voucher_date: "2026-08-11",
          reference_type: "sale",
          reference_id: "sale-pos-3",
          total_amount: 1000,
          discount_amount: 0,
          payment_method: "cash",
          description: "Payment received for POS sale POS/26-27/3 -- for POS/26-27/3 Received: ₹1,000.00 CASH",
        },
      ],
      advances: [],
      refunds: [],
    });

    const balanceRows = rows.filter((r) => !r.internal);
    const totalDebit = balanceRows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = balanceRows.reduce((s, r) => s + r.credit, 0);
    const pas = balanceRows.filter((r) => r.id.startsWith("pas-"));
    const receipts = balanceRows.filter((r) => r.id.startsWith("ve-rcpt-"));

    expect(pas).toHaveLength(0);
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.credit).toBe(1000);
    expect(totalDebit).toBe(1000);
    expect(totalCredit).toBe(1000);
  });

  it("buildAuditRows keeps residual at-sale when only part is received via voucher", () => {
    const rows = buildAuditRows({
      sales: [
        {
          id: "sale-pos-4",
          sale_number: "POS/26-27/4",
          sale_date: "2026-08-11",
          net_amount: 1000,
          paid_amount: 1000,
          cash_amount: 1000,
          card_amount: 0,
          upi_amount: 0,
          sale_return_adjust: 0,
          payment_status: "completed",
        },
      ],
      saleReturns: [],
      vouchers: [
        {
          id: "rcp-partial",
          voucher_type: "receipt",
          voucher_number: "RCP/26-27/1",
          voucher_date: "2026-08-11",
          reference_type: "sale",
          reference_id: "sale-pos-4",
          total_amount: 500,
          payment_method: "cash",
          description: "Payment received for POS sale POS/26-27/4",
        },
      ],
      advances: [],
      refunds: [],
    });

    const pas = rows.find((r) => r.id.startsWith("pas-"));
    const receipt = rows.find((r) => r.id.startsWith("ve-rcpt-"));
    expect(pas?.credit).toBe(500);
    expect(receipt?.credit).toBe(500);
  });
});
