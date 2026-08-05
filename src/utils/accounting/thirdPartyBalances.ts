import { supabase } from "@/integrations/supabase/client";
import {
  filterThirdPartyMasters,
  type ThirdPartyPickerGroup,
} from "@/utils/accounting/thirdPartyAccounts";
import { seedDefaultAccounts, type SeededAccount } from "@/utils/accounting/seedDefaultAccounts";

export type ThirdPartyBalanceRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountGroup: ThirdPartyPickerGroup | string | null;
  accountType: SeededAccount["account_type"];
  /** debit − credit (positive = Dr, negative = Cr). */
  signedBalance: number;
};

const JL_IN_CHUNK = 80;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/**
 * Load third-party master ledgers and signed GL balances from journal_lines only.
 * Does not touch voucher_entries or customer/supplier balance RPCs.
 */
export async function fetchThirdPartyBalances(organizationId: string): Promise<ThirdPartyBalanceRow[]> {
  const all = await seedDefaultAccounts(organizationId, supabase);
  const accounts = filterThirdPartyMasters(all);
  if (accounts.length === 0) return [];

  const balanceById = new Map<string, number>();
  for (const a of accounts) balanceById.set(a.id, 0);

  const ids = accounts.map((a) => a.id);
  for (let i = 0; i < ids.length; i += JL_IN_CHUNK) {
    const chunk = ids.slice(i, i + JL_IN_CHUNK);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from("journal_lines")
      .select(
        `
        account_id,
        debit_amount,
        credit_amount,
        journal_entries!inner (
          organization_id
        )
      `,
      )
      .in("account_id", chunk)
      .eq("journal_entries.organization_id", organizationId);

    if (error) throw error;

    for (const row of (data || []) as Array<{
      account_id: string;
      debit_amount: number | null;
      credit_amount: number | null;
    }>) {
      const id = row.account_id;
      if (!balanceById.has(id)) continue;
      const signed =
        (Number(row.debit_amount) || 0) - (Number(row.credit_amount) || 0);
      balanceById.set(id, round2((balanceById.get(id) || 0) + signed));
    }
  }

  return accounts.map((a) => ({
    accountId: a.id,
    accountCode: a.account_code,
    accountName: a.account_name,
    accountGroup: a.account_group,
    accountType: a.account_type,
    signedBalance: balanceById.get(a.id) || 0,
  }));
}

export function thirdPartyBalanceDirection(signed: number): "Dr" | "Cr" | "—" {
  if (Math.abs(signed) < 0.005) return "—";
  return signed > 0 ? "Dr" : "Cr";
}

export function summarizeThirdPartyBalances(rows: ThirdPartyBalanceRow[]) {
  let totalDr = 0;
  let totalCr = 0;
  for (const row of rows) {
    if (row.signedBalance > 0.005) totalDr = round2(totalDr + row.signedBalance);
    else if (row.signedBalance < -0.005) totalCr = round2(totalCr + Math.abs(row.signedBalance));
  }
  return {
    totalDr,
    totalCr,
    net: round2(totalDr - totalCr),
  };
}
