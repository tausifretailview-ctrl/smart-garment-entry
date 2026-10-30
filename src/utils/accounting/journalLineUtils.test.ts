import { describe, expect, it } from "vitest";
import { balanceJournalWithRoundOff } from "@/utils/accounting/journalLineUtils";
import type { SeededAccount } from "@/utils/accounting/seedDefaultAccounts";
import type { PostJournalLineInput } from "@/utils/accounting/accountingTypes";

const account = (code: string): SeededAccount => ({
  id: `acc-${code}`,
  organization_id: "org",
  account_code: code,
  account_name: code,
  account_type: "Expense",
  account_group: "Indirect Expenses",
  parent_account_id: null,
  is_system_account: true,
});

const accounts = [account("6900"), account("9900")];

const sale = (debit: number, credit: number): PostJournalLineInput[] => [
  { accountId: "acc-1200", debitAmount: debit, creditAmount: 0 },
  { accountId: "acc-4000", debitAmount: 0, creditAmount: credit },
];

describe("balanceJournalWithRoundOff", () => {
  it("a gap up to ₹1 is rounding: Round Off", () => {
    const lines = sale(1000.6, 1000);
    balanceJournalWithRoundOff(lines, accounts);
    expect(lines[2]).toMatchObject({ accountId: "acc-6900", debitAmount: 0, creditAmount: 0.6 });
  });

  it("a larger gap goes to Journal Differences (Suspense), not Round Off", () => {
    const lines = sale(1000, 1250);
    balanceJournalWithRoundOff(lines, accounts);
    expect(lines[2]).toMatchObject({ accountId: "acc-9900", debitAmount: 250, creditAmount: 0 });
  });

  it("falls back to Round Off when the Suspense ledger is missing", () => {
    const lines = sale(1250, 1000);
    balanceJournalWithRoundOff(lines, [account("6900")]);
    expect(lines[2]).toMatchObject({ accountId: "acc-6900", debitAmount: 0, creditAmount: 250 });
  });

  it("adds nothing when the journal balances", () => {
    const lines = sale(500, 500);
    balanceJournalWithRoundOff(lines, accounts);
    expect(lines).toHaveLength(2);
  });
});
