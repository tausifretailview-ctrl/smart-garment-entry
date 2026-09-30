/**
 * Customer Ledger must show one balance. The table's closing balance (what a user can
 * add up) and the account check (`getCustomerAccountState`, used by the summary strip)
 * must agree. Afreen's exchange with ₹300 cash back is the live case where they did not.
 */
import { describe, expect, it } from "vitest";
import { createFakeLedgerClient } from "../helpers/fakeLedgerSupabase";
import {
  AFREEN_CUSTOMER,
  AFREEN_ORG,
  buildAfreenExchangeDb,
} from "../helpers/afreenExchangeFixture";
import { fetchCustomerLedgerTransactionsWithClient } from "@/utils/customerLedgerTransactions";
import { fetchCustomerAccountStateView } from "@/utils/customerAccountStateView";
import { ledgerBalanceCheck, ledgerThreeLineSummary } from "@/utils/customerLedgerHeadline";

async function balances(cleaned: boolean) {
  const db = buildAfreenExchangeDb({ cleaned });
  const client = createFakeLedgerClient(db) as never;
  const rows = await fetchCustomerLedgerTransactionsWithClient(
    client,
    AFREEN_ORG,
    AFREEN_CUSTOMER,
    { startDate: null, endDate: null },
    0,
  );
  const table = rows.length ? rows[rows.length - 1].balance : 0;
  const state = await fetchCustomerAccountStateView(client, AFREEN_ORG, AFREEN_CUSTOMER);
  return { table: Math.round(table), check: Math.round(state.outstanding), rows };
}

describe("Afreen exchange with cash back", () => {
  it("after removing the duplicate return and refund, the table and the check both say ₹0", async () => {
    const { table, check } = await balances(true);
    expect(table).toBe(0);
    expect(check).toBe(0);
  });

  it("before cleanup, the page flags the account instead of showing two numbers", async () => {
    // SR/47's credit note is marked used by a deleted bill, so the table (gross returns)
    // and the check (credit notes) disagree. The data is wrong; the page must say so.
    const { table, check } = await balances(false);
    expect(ledgerBalanceCheck({ tableBalance: table, checkBalance: check }).needsChecking).toBe(true);
  });

  it("the three-line summary adds up to the table's last row", async () => {
    for (const cleaned of [true, false]) {
      const { table, rows } = await balances(cleaned);
      expect(Math.round(ledgerThreeLineSummary(rows).balance)).toBe(table);
    }
  });
});
