/**
 * One balance per customer: the table's closing balance (what the header shows and a
 * user can add up) must match the account check (`getCustomerAccountState`) on every
 * ledger fixture. Known disagreements are listed so a new one fails loudly; each entry
 * is a row-rule bug to fix, after which it is removed from the list.
 */
import { describe, expect, it } from "vitest";
import { fetchAllFixtureLedgers } from "../helpers/customerLedgerExtractDualRun";
import { createFakeLedgerClient } from "../helpers/fakeLedgerSupabase";
import { fetchCustomerAccountStateView } from "@/utils/customerAccountStateView";
import { ledgerBalanceCheck, ledgerThreeLineSummary } from "@/utils/customerLedgerHeadline";

/** fixture id -> [table, check]. Empty means every fixture agrees. */
const KNOWN_MISMATCHES: Record<string, [number, number]> = {};

describe("Customer Ledger shows one balance", () => {
  it("the three-line summary equals the table's last row on every fixture", async () => {
    const { ledgers } = await fetchAllFixtureLedgers();
    expect(ledgers.length).toBeGreaterThan(10);
    for (const { id, rows } of ledgers) {
      const last = rows.length ? rows[rows.length - 1].balance : 0;
      expect(ledgerThreeLineSummary(rows).balance, id).toBeCloseTo(last, 2);
    }
  });

  it("table and account check agree, except the listed known cases", async () => {
    const { org, db, ledgers } = await fetchAllFixtureLedgers();
    const found: Record<string, [number, number]> = {};
    for (const { id, rows } of ledgers) {
      const table = rows.length ? rows[rows.length - 1].balance : 0;
      const client = createFakeLedgerClient(db) as never;
      const state = await fetchCustomerAccountStateView(client, org, id);
      const check = ledgerBalanceCheck({ tableBalance: table, checkBalance: state.outstanding });
      if (check.needsChecking) found[id] = [Math.round(table), Math.round(state.outstanding)];
    }
    expect(found).toEqual(KNOWN_MISMATCHES);
  });
});
