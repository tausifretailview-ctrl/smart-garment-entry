import { supabase } from "@/integrations/supabase/client";

type AccountType = "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";

/** Tally primary group names (must match chart_of_accounts_account_group_check). */
export type AccountGroup =
  | "Branch / Divisions"
  | "Capital Account"
  | "Current Assets"
  | "Current Liabilities"
  | "Direct Expenses"
  | "Direct Incomes"
  | "Duties & Taxes"
  | "Fixed Assets"
  | "Indirect Expenses"
  | "Indirect Incomes"
  | "Investments"
  | "Loans (Liability)"
  | "Misc. Expenses (ASSET)"
  | "Provisions"
  | "Purchase Accounts"
  | "Reserves & Surplus"
  | "Retained Earnings"
  | "Sales Accounts"
  | "Stock-in-Hand"
  | "Sundry Creditors"
  | "Sundry Debtors"
  | "Suspense Account";

export interface SeededAccount {
  id: string;
  organization_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_group: AccountGroup | null;
  parent_account_id: string | null;
  is_system_account: boolean;
}

const DEFAULT_SYSTEM_ACCOUNTS: Array<{
  account_code: string;
  account_name: string;
  account_type: AccountType;
  account_group: AccountGroup;
}> = [
  { account_code: "1000", account_name: "Cash in Hand", account_type: "Asset", account_group: "Current Assets" },
  { account_code: "1010", account_name: "Bank Account", account_type: "Asset", account_group: "Current Assets" },
  { account_code: "1200", account_name: "Accounts Receivable", account_type: "Asset", account_group: "Sundry Debtors" },
  { account_code: "1300", account_name: "Stock-in-Hand", account_type: "Asset", account_group: "Stock-in-Hand" },
  { account_code: "1400", account_name: "Input CGST", account_type: "Asset", account_group: "Duties & Taxes" },
  { account_code: "1410", account_name: "Input SGST", account_type: "Asset", account_group: "Duties & Taxes" },
  { account_code: "1420", account_name: "Input IGST", account_type: "Asset", account_group: "Duties & Taxes" },
  { account_code: "2000", account_name: "Accounts Payable", account_type: "Liability", account_group: "Sundry Creditors" },
  { account_code: "2150", account_name: "Customer Advances", account_type: "Liability", account_group: "Current Liabilities" },
  { account_code: "2200", account_name: "Output CGST", account_type: "Liability", account_group: "Duties & Taxes" },
  { account_code: "2210", account_name: "Output SGST", account_type: "Liability", account_group: "Duties & Taxes" },
  { account_code: "2220", account_name: "Output IGST", account_type: "Liability", account_group: "Duties & Taxes" },
  { account_code: "4000", account_name: "Sales Revenue", account_type: "Revenue", account_group: "Direct Incomes" },
  { account_code: "4010", account_name: "Trade Discount Given", account_type: "Revenue", account_group: "Direct Incomes" },
  { account_code: "4050", account_name: "Sales Returns & Allowances", account_type: "Revenue", account_group: "Direct Incomes" },
  { account_code: "4100", account_name: "School Fee Income", account_type: "Revenue", account_group: "Direct Incomes" },
  { account_code: "4060", account_name: "Fee Discounts & Concessions", account_type: "Expense", account_group: "Indirect Expenses" },
  { account_code: "4070", account_name: "Late Fees & Penalties", account_type: "Revenue", account_group: "Direct Incomes" },
  { account_code: "5000", account_name: "Cost of Goods Sold", account_type: "Expense", account_group: "Direct Expenses" },
  { account_code: "5050", account_name: "Purchase Returns", account_type: "Expense", account_group: "Direct Expenses" },
  { account_code: "6000", account_name: "General Expenses", account_type: "Expense", account_group: "Indirect Expenses" },
  { account_code: "6050", account_name: "Settlement Discounts Given", account_type: "Expense", account_group: "Indirect Expenses" },
  { account_code: "6070", account_name: "Settlement Discounts Received", account_type: "Revenue", account_group: "Indirect Incomes" },
  { account_code: "6100", account_name: "Salaries & Wages", account_type: "Expense", account_group: "Indirect Expenses" },
  { account_code: "6900", account_name: "Round Off", account_type: "Expense", account_group: "Indirect Expenses" },
];

/** Bump when DEFAULT_SYSTEM_ACCOUNTS changes so in-memory cache cannot omit new codes. */
const SEED_LIST_VERSION = 2;

const SEED_CACHE_MS = 5 * 60 * 1000;
const seedCache = new Map<string, { accounts: SeededAccount[]; expiresAt: number; version: number }>();

const COA_SELECT =
  "id, organization_id, account_code, account_name, account_type, account_group, parent_account_id, is_system_account";

const REQUIRED_CODES = DEFAULT_SYSTEM_ACCOUNTS.map((a) => a.account_code);

function isUniqueViolation(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  const msg = (err.message || "").toLowerCase();
  return msg.includes("duplicate") || msg.includes("unique");
}

/** Clear after chart mutations (tests / admin tooling). */
export function clearSeedDefaultAccountsCache(organizationId?: string) {
  if (organizationId) seedCache.delete(organizationId);
  else seedCache.clear();
}

async function insertSystemAccount(
  organizationId: string,
  def: (typeof DEFAULT_SYSTEM_ACCOUNTS)[number],
  client: any,
  accountName: string,
) {
  return (client as any).from("chart_of_accounts").insert({
    organization_id: organizationId,
    account_code: def.account_code,
    account_name: accountName,
    account_type: def.account_type,
    account_group: def.account_group,
    parent_account_id: null,
    is_system_account: true,
  });
}

/**
 * Ensure required system accounts exist for an organization.
 * Returns full system-account set after insertion / promotion of missing accounts.
 *
 * Looks up by account_code across *all* rows (not only is_system_account=true).
 * Orgs that created 1200/6050 manually as non-system ledgers used to break
 * batch insert on UNIQUE(organization_id, account_code) and then failed
 * customer receipts with "Missing chart accounts … 6050".
 */
export async function seedDefaultAccounts(
  organizationId: string,
  client: any = supabase
): Promise<SeededAccount[]> {
  if (!organizationId) throw new Error("organizationId is required for seeding accounts");

  const cached = seedCache.get(organizationId);
  if (cached && cached.expiresAt > Date.now() && cached.version === SEED_LIST_VERSION) {
    const cachedCodes = new Set(cached.accounts.map((a) => a.account_code));
    if (REQUIRED_CODES.every((code) => cachedCodes.has(code))) {
      return cached.accounts;
    }
    // Stale/partial cache (e.g. older seed list) — refresh.
    seedCache.delete(organizationId);
  }

  const { data: codeRows, error: codeErr } = await (client as any)
    .from("chart_of_accounts")
    .select(COA_SELECT)
    .eq("organization_id", organizationId)
    .in("account_code", REQUIRED_CODES);

  if (codeErr) throw codeErr;

  const byCode = new Map(
    ((codeRows || []) as SeededAccount[]).map((row) => [row.account_code, row])
  );

  for (const def of DEFAULT_SYSTEM_ACCOUNTS) {
    const existing = byCode.get(def.account_code);
    if (existing) {
      const needsPromote = !existing.is_system_account;
      const needsGroup = existing.account_group !== def.account_group;
      if (needsPromote || needsGroup) {
        const { error: updErr } = await (client as any)
          .from("chart_of_accounts")
          .update({
            is_system_account: true,
            ...(needsGroup ? { account_group: def.account_group } : {}),
          })
          .eq("id", existing.id)
          .eq("organization_id", organizationId);
        if (updErr) throw updErr;
        existing.is_system_account = true;
        if (needsGroup) existing.account_group = def.account_group;
      }
      continue;
    }

    let { error: insertErr } = await insertSystemAccount(
      organizationId,
      def,
      client,
      def.account_name,
    );

    // UNIQUE(organization_id, account_name) — another ledger already uses the
    // canonical name under a different code. Retry with a code-suffixed name.
    if (insertErr && isUniqueViolation(insertErr)) {
      const fallbackName = `${def.account_name} (${def.account_code})`;
      ({ error: insertErr } = await insertSystemAccount(
        organizationId,
        def,
        client,
        fallbackName,
      ));
    }

    if (insertErr) {
      // Concurrent seed may have inserted the same code — re-read and promote.
      if (isUniqueViolation(insertErr)) {
        const { data: raced, error: racedErr } = await (client as any)
          .from("chart_of_accounts")
          .select(COA_SELECT)
          .eq("organization_id", organizationId)
          .eq("account_code", def.account_code)
          .maybeSingle();
        if (racedErr) throw racedErr;
        if (raced) {
          if (!raced.is_system_account || raced.account_group !== def.account_group) {
            const { error: updErr } = await (client as any)
              .from("chart_of_accounts")
              .update({
                is_system_account: true,
                account_group: def.account_group,
              })
              .eq("id", raced.id)
              .eq("organization_id", organizationId);
            if (updErr) throw updErr;
            raced.is_system_account = true;
            raced.account_group = def.account_group;
          }
          byCode.set(def.account_code, raced as SeededAccount);
          continue;
        }
      }
      throw insertErr;
    }
  }

  const { data: finalRows, error: finalErr } = await (client as any)
    .from("chart_of_accounts")
    .select(COA_SELECT)
    .eq("organization_id", organizationId)
    .eq("is_system_account", true);

  if (finalErr) throw finalErr;
  const accounts = (finalRows || []) as SeededAccount[];

  const finalCodes = new Set(accounts.map((a) => a.account_code));
  const stillMissing = REQUIRED_CODES.filter((code) => !finalCodes.has(code));
  if (stillMissing.length > 0) {
    throw new Error(
      `Failed to ensure system chart accounts: missing ${stillMissing.join(", ")}. Check Chart of Accounts / org permissions.`,
    );
  }

  seedCache.set(organizationId, {
    accounts,
    expiresAt: Date.now() + SEED_CACHE_MS,
    version: SEED_LIST_VERSION,
  });
  return accounts;
}
