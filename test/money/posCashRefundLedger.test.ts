/**
 * Rahmani NX: cashier clicks Cash on a same-bill exchange.
 * Bill ₹3,300, return ₹3,500, ₹200 paid back in cash.
 * The receipt and POS dashboard already show the refund. The customer balance must be ₹0.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createFakeLedgerClient, type LedgerDb } from "../helpers/fakeLedgerSupabase";
import { fetchCustomerLedgerTransactionsWithClient } from "@/utils/customerLedgerTransactions";
import { fetchCustomerAccountStateView } from "@/utils/customerAccountStateView";
import { computeCustomerBalanceCore } from "@/utils/customerBalanceCore";

const ORG = "org-rahmani";
const CUST = "c-rahmani";

function exchangeDb(): LedgerDb {
  return {
    customers: [
      { id: CUST, organization_id: ORG, customer_name: "RAHMANI", opening_balance: 0, deleted_at: null },
    ],
    sales: [
      {
        id: "pos-200",
        organization_id: ORG,
        customer_id: CUST,
        sale_number: "POS/26-27/200",
        sale_type: "pos",
        sale_date: "2026-10-04T12:00:00+00:00",
        created_at: "2026-10-04T12:00:01.000Z",
        gross_amount: 3300,
        discount_amount: 0,
        flat_discount_amount: 0,
        net_amount: 3300,
        paid_amount: 0,
        sale_return_adjust: 3300,
        refund_amount: 200,
        payment_status: "completed",
        is_cancelled: false,
        cash_amount: 0,
        card_amount: 0,
        upi_amount: 0,
        payment_method: "multiple",
        deleted_at: null,
      },
    ],
    sale_items: [{ sale_id: "pos-200", quantity: 1, mrp: 3300, deleted_at: null }],
    voucher_entries: [
      {
        id: "pay-200",
        organization_id: ORG,
        voucher_type: "payment",
        reference_type: "customer",
        reference_id: CUST,
        voucher_date: "2026-10-04",
        voucher_number: "PAY/26-27/200",
        total_amount: 200,
        discount_amount: 0,
        payment_method: "cash",
        description: "Refund paid for POS exchange POS/26-27/200",
        created_at: "2026-10-04T12:00:02.000Z",
        deleted_at: null,
      },
      {
        id: "rcp-200",
        organization_id: ORG,
        voucher_type: "receipt",
        reference_type: "sale",
        reference_id: "pos-200",
        voucher_date: "2026-10-04",
        voucher_number: "RCP/26-27/200",
        total_amount: 3300,
        discount_amount: 0,
        payment_method: "credit_note_adjustment",
        description: "Credit note adjusted against POS/26-27/200",
        created_at: "2026-10-04T12:00:03.000Z",
        deleted_at: null,
      },
    ],
    customer_advances: [],
    customer_balance_adjustments: [],
    sale_returns: [
      {
        id: "sr-200",
        customer_id: CUST,
        organization_id: ORG,
        return_number: "SR/26-27/200",
        return_date: "2026-10-04",
        gross_amount: 3500,
        net_amount: 3500,
        credit_status: "adjusted",
        linked_sale_id: "pos-200",
        refund_type: "exchange",
        credit_note_id: "cn-200",
        credit_available_balance: 0,
        created_at: "2026-10-04T11:59:00.000Z",
        deleted_at: null,
      },
    ],
    credit_notes: [
      {
        id: "cn-200",
        customer_id: CUST,
        organization_id: ORG,
        credit_note_number: "CN/26-27/200",
        issue_date: "2026-10-04",
        credit_amount: 3500,
        used_amount: 3500,
        status: "fully_used",
        notes: "Credit note from sale return SR/26-27/200",
        sale_id: null,
        created_at: "2026-10-04T11:59:30.000Z",
        deleted_at: null,
      },
    ],
    advance_refunds: [],
  };
}

const exchangeVoucher = {
  voucher_type: "payment",
  reference_type: "customer",
  total_amount: 200,
  description: "Refund paid for POS exchange POS/26-27/200",
  payment_method: "cash",
};

const exchangeReturn = {
  id: "sr-200",
  net_amount: 3500,
  credit_status: "adjusted",
  linked_sale_id: "pos-200",
  credit_available_balance: 0,
  refund_type: "exchange",
};

describe("direct Cash exchange refund leaves the customer at ₹0", () => {
  it("loads sales.refund_amount into the account check", () => {
    const src = readFileSync(new URL("../../src/utils/customerAuditBundle.ts", import.meta.url), "utf8");
    const select = src.slice(src.indexOf('.from("sales")'), src.indexOf('.from("sales")') + 500);
    expect(select).toContain("refund_amount");
  });

  it("ledger table and account check both close at ₹0", async () => {
    const client = createFakeLedgerClient(exchangeDb()) as never;
    const rows = await fetchCustomerLedgerTransactionsWithClient(
      client,
      ORG,
      CUST,
      { startDate: null, endDate: null },
      0,
    );
    const table = rows.length ? rows[rows.length - 1].balance : 0;
    const state = await fetchCustomerAccountStateView(client, ORG, CUST);
    expect(Math.round(table)).toBe(0);
    expect(Math.round(state.netPosition)).toBe(0);
  });

  it("counts the cash payout once: on the bill, not again as a voucher", () => {
    const withRefundOnBill = computeCustomerBalanceCore({
      openingBalance: 0,
      sales: [
        {
          id: "pos-200",
          sale_number: "POS/26-27/200",
          net_amount: 3300,
          paid_amount: 0,
          sale_return_adjust: 3300,
          refund_amount: 200,
          items_gross: 3300,
          payment_status: "completed",
        },
      ],
      voucherEntries: [exchangeVoucher],
      customerAdvances: [],
      advanceRefunds: [],
      adjustmentTotal: 0,
      saleReturns: [exchangeReturn],
    });
    expect(withRefundOnBill.customerPaymentDebits).toBe(0);
    expect(withRefundOnBill.balance).toBe(0);

    // Dropping refund_amount is what left Rahmani owing ₹200: the voucher was added
    // even though the bill already recorded the cash paid back.
    const columnMissing = computeCustomerBalanceCore({
      openingBalance: 0,
      sales: [
        {
          id: "pos-200",
          sale_number: "POS/26-27/200",
          net_amount: 3300,
          paid_amount: 0,
          sale_return_adjust: 3300,
          items_gross: 3300,
          payment_status: "completed",
        },
      ],
      voucherEntries: [exchangeVoucher],
      customerAdvances: [],
      advanceRefunds: [],
      adjustmentTotal: 0,
      saleReturns: [exchangeReturn],
    });
    expect(columnMissing.customerPaymentDebits).toBe(200);
    expect(columnMissing.balance).toBe(200);
  });

  it("still counts a legacy exchange voucher when the bill has no refund_amount", () => {
    const legacy = computeCustomerBalanceCore({
      openingBalance: 0,
      sales: [
        {
          id: "pos-old",
          sale_number: "POS/26-27/1",
          net_amount: 0,
          paid_amount: 0,
          sale_return_adjust: 0,
          refund_amount: 0,
          payment_status: "completed",
        },
      ],
      voucherEntries: [
        {
          ...exchangeVoucher,
          description: "Refund paid for POS exchange POS/26-27/1",
        },
      ],
      customerAdvances: [],
      advanceRefunds: [],
      adjustmentTotal: 0,
      saleReturns: [],
    });
    expect(legacy.customerPaymentDebits).toBe(200);
    expect(legacy.balance).toBe(200);
  });
});
