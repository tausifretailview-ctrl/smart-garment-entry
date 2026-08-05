import type { AccountGroup, SeededAccount } from "@/utils/accounting/seedDefaultAccounts";

type AccountType = SeededAccount["account_type"];

/** Non-trade parties / deposits / loans — not customer or supplier masters. */
export const THIRD_PARTY_PICKER_GROUPS = [
  "Sundry Debtors",
  "Sundry Creditors",
  "Fixed Assets",
  "Current Assets",
  "Investments",
  "Loans (Liability)",
  "Current Liabilities",
  "Provisions",
  "Misc. Expenses (ASSET)",
] as const satisfies readonly AccountGroup[];

export type ThirdPartyPickerGroup = (typeof THIRD_PARTY_PICKER_GROUPS)[number];

/** Tally groups offered when creating a master, scoped by account type. */
export const TALLY_GROUPS_BY_ACCOUNT_TYPE: Record<AccountType, readonly AccountGroup[]> = {
  Asset: [
    "Sundry Debtors",
    "Fixed Assets",
    "Current Assets",
    "Investments",
    "Stock-in-Hand",
    "Misc. Expenses (ASSET)",
    "Duties & Taxes",
  ],
  Liability: [
    "Sundry Creditors",
    "Current Liabilities",
    "Loans (Liability)",
    "Provisions",
    "Duties & Taxes",
  ],
  Equity: ["Capital Account", "Reserves & Surplus", "Retained Earnings"],
  Revenue: ["Direct Incomes", "Sales Accounts", "Indirect Incomes"],
  Expense: ["Direct Expenses", "Purchase Accounts", "Indirect Expenses"],
};

const PICKER_GROUP_SET = new Set<string>(THIRD_PARTY_PICKER_GROUPS);

/** Cash / bank ledgers used on the opposite side of a third-party voucher. */
export function isCashOrBankLedger(account: Pick<SeededAccount, "account_code" | "account_name" | "account_type">): boolean {
  if (account.account_type !== "Asset") return false;
  if (account.account_code === "1000" || account.account_code === "1010") return true;
  return /(cash|bank|upi|card)/i.test(account.account_name);
}

/**
 * Party/master ledgers eligible for third-party pay/receive.
 * Excludes system cash/bank/AR/AP aggregators — those stay on customer/supplier paths.
 */
export function isThirdPartyMasterAccount(
  account: Pick<SeededAccount, "account_group" | "is_system_account" | "account_code">,
): boolean {
  if (account.is_system_account) return false;
  if (!account.account_group || !PICKER_GROUP_SET.has(account.account_group)) return false;
  if (account.account_code === "1000" || account.account_code === "1010") return false;
  if (account.account_code === "1200" || account.account_code === "2000") return false;
  return true;
}

export function filterThirdPartyMasters(accounts: SeededAccount[]): SeededAccount[] {
  return accounts
    .filter(isThirdPartyMasterAccount)
    .sort((a, b) => a.account_code.localeCompare(b.account_code));
}

export function filterCashBankAccounts(accounts: SeededAccount[]): SeededAccount[] {
  return accounts.filter(isCashOrBankLedger).sort((a, b) => a.account_code.localeCompare(b.account_code));
}

/**
 * Next free code in 9001–9999 for third-party masters.
 * `chart_of_accounts` is UNIQUE (organization_id, account_code).
 */
export async function allocateThirdPartyAccountCode(
  organizationId: string,
  client: { from: (table: string) => any },
): Promise<string> {
  const { data, error } = await client
    .from("chart_of_accounts")
    .select("account_code")
    .eq("organization_id", organizationId)
    .like("account_code", "9%");
  if (error) throw error;

  const used = new Set(
    ((data || []) as Array<{ account_code: string }>).map((r) => String(r.account_code).trim()),
  );
  for (let n = 9001; n <= 9999; n++) {
    const code = String(n);
    if (!used.has(code)) return code;
  }
  throw new Error("No free account codes left in the 9001–9999 range");
}

export function isUniqueAccountCodeViolation(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  if (e?.code === "23505") return true;
  return /account_code|duplicate key|unique/i.test(e?.message || "");
}
