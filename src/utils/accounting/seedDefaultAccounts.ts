import { supabase } from "@/integrations/supabase/client";

type AccountType = "Asset" | "Liability" | "Equity" | "Revenue" | "Expense";

export interface SeededAccount {
  id: string;
  organization_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  parent_account_id: string | null;
  is_system_account: boolean;
}

const DEFAULT_SYSTEM_ACCOUNTS: Array<{
  account_code: string;
  account_name: string;
  account_type: AccountType;
}> = [
  { account_code: "1000", account_name: "Cash in Hand", account_type: "Asset" },
  { account_code: "1200", account_name: "Accounts Receivable", account_type: "Asset" },
  { account_code: "2000", account_name: "Accounts Payable", account_type: "Liability" },
  { account_code: "4000", account_name: "Sales Revenue", account_type: "Revenue" },
  { account_code: "4100", account_name: "School Fee Income", account_type: "Revenue" },
  { account_code: "5000", account_name: "Cost of Goods Sold", account_type: "Expense" },
  { account_code: "6000", account_name: "General Expenses", account_type: "Expense" },
  { account_code: "6050", account_name: "Settlement Discounts Given", account_type: "Expense" },
  { account_code: "6100", account_name: "Salaries & Wages", account_type: "Expense" },
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
    .select("id, organization_id, account_code, account_name, account_type, parent_account_id, is_system_account")
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
      parent_account_id: null,
      is_system_account: true,
    }));
    const { error: insertErr } = await (client as any).from("chart_of_accounts").insert(payload);
    if (insertErr) throw insertErr;
  }

  const { data: finalRows, error: finalErr } = await (client as any)
    .from("chart_of_accounts")
    .select("id, organization_id, account_code, account_name, account_type, parent_account_id, is_system_account")
    .eq("organization_id", organizationId)
    .eq("is_system_account", true);

  if (finalErr) throw finalErr;
  return (finalRows || []) as SeededAccount[];
}

