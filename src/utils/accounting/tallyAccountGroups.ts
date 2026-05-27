import type { GlTrialBalanceEntry } from "@/utils/accountingReportUtils";
import type { AccountGroup } from "@/utils/accounting/seedDefaultAccounts";

/** Display order for Tally primary groups on trial balance / balance sheet. */
export const TALLY_GROUP_DISPLAY_ORDER: readonly AccountGroup[] = [
  "Capital Account",
  "Reserves & Surplus",
  "Retained Earnings",
  "Loans (Liability)",
  "Current Liabilities",
  "Sundry Creditors",
  "Duties & Taxes",
  "Provisions",
  "Fixed Assets",
  "Investments",
  "Current Assets",
  "Stock-in-Hand",
  "Sundry Debtors",
  "Branch / Divisions",
  "Misc. Expenses (ASSET)",
  "Direct Incomes",
  "Sales Accounts",
  "Indirect Incomes",
  "Direct Expenses",
  "Purchase Accounts",
  "Indirect Expenses",
  "Suspense Account",
] as const;

const BS_ASSET_GROUPS = new Set<string>([
  "Fixed Assets",
  "Investments",
  "Current Assets",
  "Stock-in-Hand",
  "Sundry Debtors",
  "Branch / Divisions",
  "Misc. Expenses (ASSET)",
  "Duties & Taxes",
]);

const BS_LIABILITY_GROUPS = new Set<string>([
  "Capital Account",
  "Reserves & Surplus",
  "Loans (Liability)",
  "Current Liabilities",
  "Sundry Creditors",
  "Provisions",
]);

const BS_EQUITY_GROUPS = new Set<string>(["Retained Earnings"]);

export type GlTrialBalanceGroupSection = {
  groupName: string;
  entries: GlTrialBalanceEntry[];
  totalDebit: number;
  totalCredit: number;
};

export function groupOrderIndex(groupName: string | null | undefined): number {
  if (!groupName) return 9999;
  const idx = TALLY_GROUP_DISPLAY_ORDER.indexOf(groupName as AccountGroup);
  return idx >= 0 ? idx : 9000;
}

export function groupGlTrialBalance(entries: GlTrialBalanceEntry[]): GlTrialBalanceGroupSection[] {
  const byGroup = new Map<string, GlTrialBalanceEntry[]>();
  for (const e of entries) {
    const key = e.accountGroup?.trim() || inferGroupFromType(e.accountType);
    const list = byGroup.get(key) ?? [];
    list.push(e);
    byGroup.set(key, list);
  }

  const sections: GlTrialBalanceGroupSection[] = [];
  for (const [groupName, groupEntries] of byGroup) {
    const sorted = [...groupEntries].sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    const totalDebit = round2(sorted.reduce((s, e) => s + e.debit, 0));
    const totalCredit = round2(sorted.reduce((s, e) => s + e.credit, 0));
    sections.push({ groupName, entries: sorted, totalDebit, totalCredit });
  }

  sections.sort((a, b) => groupOrderIndex(a.groupName) - groupOrderIndex(b.groupName));
  return sections;
}

function inferGroupFromType(accountType: string): string {
  switch (accountType) {
    case "Asset":
      return "Current Assets";
    case "Liability":
      return "Current Liabilities";
    case "Equity":
      return "Capital Account";
    case "Revenue":
      return "Direct Incomes";
    case "Expense":
      return "Indirect Expenses";
    default:
      return "Other";
  }
}

export type GlBalanceSheetGroupBucket = "assets" | "liabilities" | "equity" | "pnl";

export function balanceSheetBucketForGroup(
  accountGroup: string | null | undefined,
  accountType: string
): GlBalanceSheetGroupBucket {
  const g = accountGroup?.trim();
  if (g && BS_ASSET_GROUPS.has(g)) return "assets";
  if (g && BS_LIABILITY_GROUPS.has(g)) return "liabilities";
  if (g && BS_EQUITY_GROUPS.has(g)) return "equity";
  if (accountType === "Asset") return "assets";
  if (accountType === "Liability") return "liabilities";
  if (accountType === "Equity") return "equity";
  if (accountType === "Revenue" || accountType === "Expense") return "pnl";
  return "assets";
}

export type GlGroupedBalanceSheetSection = {
  groupName: string;
  lines: Array<{
    accountCode: string;
    accountName: string;
    amount: number;
  }>;
  subtotal: number;
};

export function groupGlBalanceSheetLines(
  lines: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    accountGroup?: string | null;
    amount: number;
  }>,
  bucket: GlBalanceSheetGroupBucket
): GlGroupedBalanceSheetSection[] {
  const filtered = lines.filter(
    (l) => balanceSheetBucketForGroup(l.accountGroup, l.accountType) === bucket
  );
  const byGroup = new Map<string, typeof filtered>();
  for (const line of filtered) {
    const key = line.accountGroup?.trim() || inferGroupFromType(line.accountType);
    const list = byGroup.get(key) ?? [];
    list.push(line);
    byGroup.set(key, list);
  }

  const sections: GlGroupedBalanceSheetSection[] = [];
  for (const [groupName, groupLines] of byGroup) {
    const sorted = [...groupLines].sort((a, b) => a.accountCode.localeCompare(b.accountCode));
    const subtotal = round2(sorted.reduce((s, l) => s + l.amount, 0));
    sections.push({
      groupName,
      lines: sorted.map((l) => ({
        accountCode: l.accountCode,
        accountName: l.accountName,
        amount: l.amount,
      })),
      subtotal,
    });
  }
  sections.sort((a, b) => groupOrderIndex(a.groupName) - groupOrderIndex(b.groupName));
  return sections;
}

const round2 = (x: number) => Math.round(x * 100) / 100;
