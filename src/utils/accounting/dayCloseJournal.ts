import { supabase } from "@/integrations/supabase/client";
import {
  deleteJournalEntryByReference,
  isAccountingEngineOnForOrg,
  postJournalEntry,
} from "@/utils/accounting/journalService";
import type { PostJournalLineInput } from "@/utils/accounting/accountingTypes";
import { seedDefaultAccounts } from "@/utils/accounting/seedDefaultAccounts";

const round2 = (value: number) => Math.round((Number(value) || 0) * 100) / 100;

type ChartAccountDef = {
  code: string;
  name: string;
  type: "Equity" | "Expense";
  group: "Capital Account" | "Indirect Expenses";
};

/** Cash the owner takes out of the drawer at day close (proprietor's drawings). */
export const OWNER_DRAWINGS_ACCOUNT: ChartAccountDef = {
  code: "3100",
  name: "Owner's Drawings",
  type: "Equity",
  group: "Capital Account",
};

/** Day-close difference between counted and expected cash (Dr = short, Cr = excess). */
export const CASH_SHORT_EXCESS_ACCOUNT: ChartAccountDef = {
  code: "6910",
  name: "Cash Short & Excess",
  type: "Expense",
  group: "Indirect Expenses",
};

/**
 * Find a ledger by code, or create it. These two are only needed by the day close, so they
 * are created on first use instead of joining the required system accounts every journal seeds.
 */
async function ensureChartAccount(organizationId: string, def: ChartAccountDef, client: any): Promise<string> {
  const find = async () => {
    const { data, error } = await client
      .from("chart_of_accounts")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("account_code", def.code)
      .maybeSingle();
    if (error) throw error;
    return (data as { id?: string } | null)?.id ?? null;
  };
  const existing = await find();
  if (existing) return existing;

  const insert = (accountName: string) =>
    client.from("chart_of_accounts").insert({
      organization_id: organizationId,
      account_code: def.code,
      account_name: accountName,
      account_type: def.type,
      account_group: def.group,
      parent_account_id: null,
      is_system_account: false,
    });
  let { error } = await insert(def.name);
  // Name already used by another ledger: keep the code, add it to the name.
  if (error && (error as { code?: string }).code === "23505") {
    const raced = await find();
    if (raced) return raced;
    ({ error } = await insert(`${def.name} (${def.code})`));
  }
  if (error) throw error;
  const created = await find();
  if (!created) throw new Error(`Could not create ledger ${def.name} (${def.code})`);
  return created;
}

/** Journal lines for the cash that left (or appeared in) the drawer at day close. */
export function buildDayCloseCashLines(params: {
  cashAccountId: string;
  drawingsAccountId: string | null;
  shortExcessAccountId: string | null;
  handover: number;
  difference: number;
}): PostJournalLineInput[] {
  const lines: PostJournalLineInput[] = [];
  const handover = round2(Math.max(0, params.handover));
  const difference = round2(params.difference);
  if (handover > 0 && params.drawingsAccountId) {
    lines.push({ accountId: params.drawingsAccountId, debitAmount: handover, creditAmount: 0 });
    lines.push({ accountId: params.cashAccountId, debitAmount: 0, creditAmount: handover });
  }
  if (Math.abs(difference) >= 0.01 && params.shortExcessAccountId) {
    const amount = Math.abs(difference);
    if (difference < 0) {
      lines.push({ accountId: params.shortExcessAccountId, debitAmount: amount, creditAmount: 0 });
      lines.push({ accountId: params.cashAccountId, debitAmount: 0, creditAmount: amount });
    } else {
      lines.push({ accountId: params.cashAccountId, debitAmount: amount, creditAmount: 0 });
      lines.push({ accountId: params.shortExcessAccountId, debitAmount: 0, creditAmount: amount });
    }
  }
  return lines;
}

/**
 * Day close (Account Tally / Cash Tally): post the owner handover (Dr Owner's Drawings, Cr Cash)
 * and the counted-vs-expected difference (Cash Short & Excess) so Cash in Hand in the ledger
 * follows the drawer. Keyed by the tally snapshot id like the bank deposit: a re-save replaces
 * it and zero amounts remove it.
 */
export async function syncDayCloseCashJournal(params: {
  organizationId: string;
  snapshotId: string;
  tallyDate: string;
  handover: number;
  difference: number;
}): Promise<void> {
  const client = supabase;
  if (!params.organizationId || !params.snapshotId) return;
  if (!(await isAccountingEngineOnForOrg(params.organizationId, client))) return;

  await deleteJournalEntryByReference(params.organizationId, "ManualJournal", params.snapshotId, client);

  const handover = round2(Math.max(0, params.handover));
  const difference = round2(params.difference);
  if (handover <= 0 && Math.abs(difference) < 0.01) return;

  const accounts = await seedDefaultAccounts(params.organizationId, client);
  const cash = accounts.find((a) => a.account_code === "1000");
  if (!cash) throw new Error("Cash in Hand (1000) ledger is missing");
  const drawingsAccountId =
    handover > 0 ? await ensureChartAccount(params.organizationId, OWNER_DRAWINGS_ACCOUNT, client) : null;
  const shortExcessAccountId =
    Math.abs(difference) >= 0.01
      ? await ensureChartAccount(params.organizationId, CASH_SHORT_EXCESS_ACCOUNT, client)
      : null;

  const lines = buildDayCloseCashLines({
    cashAccountId: cash.id,
    drawingsAccountId,
    shortExcessAccountId,
    handover,
    difference,
  });
  if (!lines.length) return;

  const [y, m, d] = params.tallyDate.split("-");
  const parts = [
    handover > 0 ? "owner handover" : null,
    difference < -0.005 ? "cash short" : difference > 0.005 ? "cash excess" : null,
  ].filter(Boolean);
  await postJournalEntry({
    organizationId: params.organizationId,
    date: params.tallyDate,
    referenceType: "ManualJournal",
    referenceId: params.snapshotId,
    description: `Day close ${d}/${m}/${y}: ${parts.join(", ")}`,
    lines,
    client,
  });
}
