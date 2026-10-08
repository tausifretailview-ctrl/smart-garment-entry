import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import {
  buildGlBalanceSheetReport,
  buildGlProfitAndLossFromTrial,
  fetchGlBalanceSheet,
  type GlTrialBalanceEntry,
} from "./accountingReportUtils";

const row = (
  accountCode: string,
  accountType: string,
  movementDebit: number,
  movementCredit: number,
): GlTrialBalanceEntry => ({
  accountId: `id-${accountCode}`,
  accountCode,
  accountName: `Account ${accountCode}`,
  accountType,
  accountGroup: null,
  movementDebit,
  movementCredit,
  debit: Math.max(movementDebit - movementCredit, 0),
  credit: Math.max(movementCredit - movementDebit, 0),
});

describe("GL P&L from trial rows", () => {
  it("nets revenue as Cr − Dr and expenses as Dr − Cr, ignoring balance-sheet accounts", () => {
    const pnl = buildGlProfitAndLossFromTrial(
      [
        row("1000", "Asset", 5000, 0),
        row("4000", "Revenue", 0, 10000),
        row("4050", "Revenue", 1200, 0), // sales returns reduce revenue
        row("5000", "Expense", 6000, 0),
        row("6900", "Expense", 0.4, 0.9), // net round-off gain
      ],
      "2026-04-01",
      "2026-04-30",
    );
    expect(pnl.revenueLines.map((l) => [l.accountCode, l.amount])).toEqual([
      ["4000", 10000],
      ["4050", -1200],
    ]);
    expect(pnl.totalRevenue).toBe(8800);
    expect(pnl.totalExpenses).toBe(5999.5);
    expect(pnl.netProfit).toBe(2800.5);
    expect(pnl.isNetLoss).toBe(false);
  });
});

describe("GL balance sheet from trial rows", () => {
  it("balances when ledger opening balances (capital vs cash) are in the trial rows", () => {
    // Opening: Dr Cash 50,000 / Cr Capital 50,000 (ledger_opening_balances).
    // Sale: Dr Cash 1,180 / Cr Sales 1,000 / Cr Output GST 180.
    // COGS: Dr COGS 600 / Cr Stock 600 (stock came in via opening Dr Stock 600 / Cr Capital 600).
    const rows = [
      row("1000", "Asset", 51180, 0),
      row("1300", "Asset", 600, 600),
      row("2200", "Liability", 0, 180),
      row("3000", "Equity", 0, 50600),
      row("4000", "Revenue", 0, 1000),
      row("5000", "Expense", 600, 0),
    ];
    const bs = buildGlBalanceSheetReport(rows, rows, "2026-05-31", "FY 2026-27");
    expect(bs.totalAssets).toBe(51180);
    expect(bs.totalLiabilities).toBe(180);
    expect(bs.totalEquityPosted).toBe(50600);
    expect(bs.retainedEarningsLine.amount).toBe(400);
    expect(bs.currentYearProfit).toBe(400);
    expect(bs.totalEquity).toBe(51000);
    expect(bs.isBalanced).toBe(true);
    expect(bs.balanceDifference).toBe(0);
  });

  it("reports the difference when the ledger itself is out of balance", () => {
    const rows = [row("1000", "Asset", 1000, 0), row("3000", "Equity", 0, 900)];
    const bs = buildGlBalanceSheetReport(rows, [], "2026-05-31", "FY 2026-27");
    expect(bs.isBalanced).toBe(false);
    expect(bs.balanceDifference).toBe(100);
    expect(bs.currentYearProfit).toBe(0);
  });

  it("loads cumulative and FY rows from the GL trial balance RPC", async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client = {
      rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, ...args });
        return {
          data: [
            {
              account_id: "a",
              account_code: "1000",
              account_name: "Cash",
              account_type: "Asset",
              movement_debit: 100,
              movement_credit: 0,
            },
            {
              account_id: "b",
              account_code: "4000",
              account_name: "Sales",
              account_type: "Revenue",
              movement_debit: 0,
              movement_credit: 100,
            },
          ],
          error: null,
        };
      }),
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bs = await fetchGlBalanceSheet("org-1", "2026-10-08", client as any);
    expect(calls).toEqual([
      { name: "get_gl_trial_balance", p_org_id: "org-1", p_from_date: "1900-01-01", p_to_date: "2026-10-08" },
      { name: "get_gl_trial_balance", p_org_id: "org-1", p_from_date: "2026-04-01", p_to_date: "2026-10-08" },
    ]);
    expect(bs.isBalanced).toBe(true);
    expect(bs.retainedEarningsLine.amount).toBe(100);
  });
});
