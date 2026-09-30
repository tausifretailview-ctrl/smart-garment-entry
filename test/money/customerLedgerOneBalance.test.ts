/**
 * One balance per customer: the table's closing balance (what the header shows and a
 * user can add up) must match the account check (`getCustomerAccountState`) on every
 * ledger fixture. Known disagreements are listed so a new one fails loudly; each entry
 * is a row-rule bug to fix, after which it is removed from the list.
 */
import { describe, expect, it } from "vitest";
import { fetchAllFixtureLedgers } from "../helpers/customerLedgerExtractDualRun";
import { createFakeLedgerClient, type LedgerDb } from "../helpers/fakeLedgerSupabase";
import { fetchCustomerAccountStateView } from "@/utils/customerAccountStateView";
import { ledgerBalanceCheck, ledgerThreeLineSummary } from "@/utils/customerLedgerHeadline";

/**
 * Fixtures carry no sale_items; the account check reads item gross to tell whether a
 * bill's net already includes a return. Give each bill one line at its net (full bill,
 * Rule B), as the Maseera reconstruction test does with items_gross.
 */
function withSaleItems(db: LedgerDb): LedgerDb {
  const sales = (db.sales || []) as Array<{ id: string; net_amount?: number }>;
  return {
    ...db,
    sale_items: sales.map((s) => ({
      sale_id: s.id,
      quantity: 1,
      mrp: Number(s.net_amount) || 0,
      deleted_at: null,
    })),
  };
}

/** fixture id -> [table, check]. Each entry says why the page should flag it. */
const KNOWN_MISMATCHES: Record<string, [number, number]> = {
  // A bare credit_notes row with no parent sale return and no issuance voucher. The app
  // no longer creates these (useCreditNotes writes one or the other); legacy data like
  // this should show "Balance needs checking" so the shop can link or remove it.
  "c-cn": [-750, 0],
};

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
    const { org, db: rawDb, ledgers } = await fetchAllFixtureLedgers();
    const db = withSaleItems(rawDb);
    const found: Record<string, [number, number]> = {};
    for (const { id, rows } of ledgers) {
      const table = rows.length ? rows[rows.length - 1].balance : 0;
      const client = createFakeLedgerClient(db) as never;
      const state = await fetchCustomerAccountStateView(client, org, id);
      // The table credits advance receipts as they come in, so compare with the check's
      // net position (outstanding − unused advance), not outstanding alone.
      const check = ledgerBalanceCheck({ tableBalance: table, checkBalance: state.netPosition });
      if (check.needsChecking) found[id] = [Math.round(table), Math.round(state.netPosition)];
    }
    expect(found).toEqual(KNOWN_MISMATCHES);
  });
});

describe("Customer Ledger page shows a single headline", () => {
  it("renders the one-balance header and no longer shows a second balance strip", async () => {
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    const src = readFileSync(resolve(__dirname, "../../src/components/CustomerLedger.tsx"), "utf8");
    expect(src).toContain("<CustomerLedgerBalanceHeader");
    expect(src).not.toContain("<CustomerAccountSummaryStrip");
    // Rendered text only (comments may still mention the old labels).
    expect(src).not.toMatch(/^\s*Refund owed\s*$/m);
    expect(src).not.toContain("SQL snapshot ₹");
  });
});
