/**
 * POS/26-27/334 (HAMZAS, 01-10-2026): bill ₹2,500 − ₹500 discount = ₹2,000, ₹798 of an
 * exchange return applied, ₹1,202 paid in cash. The POS Dashboard says Paid and the ledger
 * balance reaches ₹0, but the ledger invoice row said "Partial".
 */
import { describe, expect, it } from "vitest";
import { createFakeLedgerClient, type LedgerDb } from "../helpers/fakeLedgerSupabase";
import { fetchCustomerLedgerTransactionsWithClient } from "@/utils/customerLedgerTransactions";

const ORG = "org-hamzas-fixture";
const CUST = "c-hamzas";

function db(): LedgerDb {
  return {
    customers: [{ id: CUST, organization_id: ORG, opening_balance: 0, deleted_at: null }],
    sales: [
      {
        id: "pos-334",
        organization_id: ORG,
        customer_id: CUST,
        sale_number: "POS/26-27/334",
        sale_type: "pos",
        sale_date: "2026-10-01T07:56:00+00:00",
        created_at: "2026-10-01T07:56:00.000Z",
        gross_amount: 2500,
        discount_amount: 500,
        flat_discount_amount: 0,
        net_amount: 2000,
        paid_amount: 1202,
        sale_return_adjust: 798,
        refund_amount: 0,
        payment_status: "partial",
        is_cancelled: false,
        cash_amount: 1202,
        card_amount: 0,
        upi_amount: 0,
        payment_method: "cash",
        deleted_at: null,
      },
    ],
    sale_returns: [],
    credit_notes: [],
    voucher_entries: [],
  } as unknown as LedgerDb;
}

describe("ledger invoice status when a return is applied on top of the full bill", () => {
  it("shows Paid, not Partial, once cash plus the return cover the bill", async () => {
    const client = createFakeLedgerClient(db()) as never;
    const rows = await fetchCustomerLedgerTransactionsWithClient(
      client,
      ORG,
      CUST,
      { startDate: null, endDate: null },
      0,
    );
    const invoice = rows.find((r) => r.type === "invoice" && r.reference === "POS/26-27/334");
    expect(invoice?.paymentStatus).toBe("completed");
  });
});
