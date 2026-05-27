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

/**
 * Ensure required system accounts exist for an organization.
 * Returns full system-account set after insertion of missing accounts.
 */
export async function seedDefaultAccounts(
  organizationId: string,
  client: any = supabase
): Promise<SeededAccount[]> {
  if (!organizationId) throw new Error("organizationId is required for seeding accounts");

  const { data: existingRows, error: existingErr } = await (client as any)
    .from("chart_of_accounts")
    .select(
      "id, organization_id, account_code, account_name, account_type, account_group, parent_account_id, is_system_account"
    )
    .eq("organization_id", organizationId)
    .eq("is_system_account", true);

  if (existingErr) throw existingErr;

  const existingByCode = new Map(
    ((existingRows || []) as SeededAccount[]).map((row) => [row.account_code, row])
  );

  const missing = DEFAULT_SYSTEM_ACCOUNTS.filter((acc) => !existingByCode.has(acc.account_code));
  if (missing.length > 0) {
    const payload = missing.map((acc) => ({
      organization_id: organizationId,
      account_code: acc.account_code,
      account_name: acc.account_name,
      account_type: acc.account_type,
      account_group: acc.account_group,
      parent_account_id: null,
      is_system_account: true,
    }));
    const { error: insertErr } = await (client as any).from("chart_of_accounts").insert(payload);
    if (insertErr) throw insertErr;
  }

  // Backfill account_group on legacy system rows that predate Phase A
  for (const def of DEFAULT_SYSTEM_ACCOUNTS) {
    const row = existingByCode.get(def.account_code);
    if (row && row.account_group !== def.account_group) {
      await (client as any)
        .from("chart_of_accounts")
        .update({ account_group: def.account_group })
        .eq("id", row.id)
        .eq("organization_id", organizationId);
    }
  }

  const { data: finalRows, error: finalErr } = await (client as any)
    .from("chart_of_accounts")
    .select(
      "id, organization_id, account_code, account_name, account_type, account_group, parent_account_id, is_system_account"
    )
    .eq("organization_id", organizationId)
    .eq("is_system_account", true);

  if (finalErr) throw finalErr;
  return (finalRows || []) as SeededAccount[];
}
