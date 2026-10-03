/**
 * One customer balance on every screen the shop reads it on:
 *   Bills due − Pending CN / return credit − Advance held = Net balance
 * from getCustomerAccountState (useCustomerAccountState / useCustomerBalance), shown with
 * CustomerAccountSummaryStrip or its compact CustomerBalanceBadge.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { customerBalanceBreakdown } from "@/utils/customerAccountStateView";
import { getCustomerAccountState } from "@/utils/customerBalanceCore";

const root = resolve(__dirname, "../..");
const read = (p: string) => readFileSync(resolve(root, p), "utf8");

describe("screens use the one balance breakdown", () => {
  it("Settle dialog: strip from account state, not the SQL net labelled Outstanding", () => {
    const src = read("src/components/SettleCustomerAccountDialog.tsx");
    expect(src).toContain("<CustomerAccountSummaryStrip");
    expect(src).toContain("useCustomerAccountState(");
    expect(src).not.toContain("trueOutstanding");
    // Advance / CN only move credit onto bills: Net after changes by cash and discount only.
    expect(src).toContain("balance.net - cashEntered - liveTotals.discount");
  });

  it("Payments tab, POS Dashboard and Sale Dashboard payment dialogs show the strip", () => {
    for (const p of [
      "src/components/accounts/CustomerPaymentTab.tsx",
      "src/pages/POSDashboard.tsx",
      "src/pages/SalesInvoiceDashboard.tsx",
    ]) {
      expect(read(p), p).toContain("<CustomerAccountSummaryStrip");
    }
  });

  it("POS Sales and Sale Invoice entry show the same Net badge with CN and advance", () => {
    for (const p of ["src/pages/POSSales.tsx", "src/pages/SalesInvoice.tsx"]) {
      const src = read(p);
      expect(src, p).toContain("<CustomerBalanceBadge");
      expect(src, p).toContain("useCustomerBalance(");
    }
    // POS customer list shows Net (as Sale Invoice), not the before-advance figure.
    expect(read("src/pages/POSSales.tsx")).not.toContain("grossOutstandingFromFinancialSnapshot(snap)");
  });

  it("Customer Ledger header shows pending advance / CN from the same account state", () => {
    const src = read("src/components/CustomerLedger.tsx");
    expect(src).toContain("unusedAdvance={accountCheck.state.unusedAdvance}");
    expect(src).toContain("pendingCn={accountCheck.state.unclaimedSaleReturn}");
    expect(read("src/components/CustomerLedgerBalanceHeader.tsx")).toContain("customerBalanceBreakdown(");
  });

  it("strip and badge both build from customerBalanceBreakdown", () => {
    expect(read("src/components/CustomerAccountSummaryStrip.tsx")).toContain("customerBalanceBreakdown(state)");
    expect(read("src/components/CustomerBalanceBadge.tsx")).toContain("customerBalanceBreakdown(");
  });

  it("payments refresh the breakdown everywhere", () => {
    expect(read("src/utils/moneyViewFreshnessInvalidation.ts")).toContain('"customer-account-state-view"');
  });
});

describe("breakdown adds up on the canonical state", () => {
  it("advance + pending return: Bills due − CN − Advance = Net = netPosition", () => {
    const state = getCustomerAccountState({
      openingBalance: 0,
      customerId: "c1",
      sales: [
        { id: "s1", customer_id: "c1", net_amount: 5000, paid_amount: 0, payment_status: "pending", sale_return_adjust: 0 },
      ] as never,
      voucherEntries: [],
      customerAdvances: [{ id: "a1", customer_id: "c1", amount: 1000, used_amount: 0, status: "active" }] as never,
      advanceRefunds: [],
      adjustmentTotal: 0,
      saleReturns: [
        { id: "r1", customer_id: "c1", net_amount: 800, credit_status: "pending", credit_available_balance: 800 },
      ] as never,
    });
    const b = customerBalanceBreakdown({
      outstanding: state.outstanding,
      unusedAdvance: state.unusedAdvancePool,
      unclaimedSaleReturn: state.unclaimedSaleReturnCredit,
      netPosition: state.netPosition,
    });
    expect(b.billsDue - b.pendingCn - b.unusedAdvance).toBe(b.net);
    expect(b.net).toBe(state.netPosition);
    expect(b.unusedAdvance).toBe(1000);
    expect(b.pendingCn).toBe(800);
    expect(b.net).toBe(5000 - 800 - 1000);
  });
});
