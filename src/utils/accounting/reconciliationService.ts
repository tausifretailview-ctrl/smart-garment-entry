import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const UPDATE_CHUNK = 200;

export type UnclearedBankJournalLine = {
  id: string;
  date: string;
  description: string | null;
  debit: number;
  credit: number;
};

/**
 * Journal lines on the given bank ledger account that are not yet reconciled with a bank statement.
 * Joins `journal_entries` for header date and description; scoped to `organizationId`.
 */
export async function fetchUnclearedBankTransactions(
  organizationId: string,
  bankLedgerId: string,
  supabase: SupabaseClient<Database>,
  options?: { statementDateEnd?: string }
): Promise<UnclearedBankJournalLine[]> {
  if (!organizationId) throw new Error("organizationId is required");
  if (!bankLedgerId) throw new Error("bankLedgerId is required");

  let q = supabase
    .from("journal_lines")
    .select(
      `
      id,
      debit_amount,
      credit_amount,
      journal_entries!inner (
        date,
        description,
        organization_id
      )
    `
    )
    .eq("account_id", bankLedgerId)
    .eq("is_reconciled", false)
    .eq("journal_entries.organization_id", organizationId);

  const end = options?.statementDateEnd?.trim();
  if (end) {
    q = q.lte("journal_entries.date", end);
  }

  const { data, error } = await q;

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    id: string;
    debit_amount: number;
    credit_amount: number;
    journal_entries: { date: string; description: string | null; organization_id: string };
  }>;

  const mapped = rows.map((r) => ({
    id: r.id,
    date: r.journal_entries?.date ?? "",
    description: r.journal_entries?.description ?? null,
    debit: Number(r.debit_amount ?? 0),
    credit: Number(r.credit_amount ?? 0),
  }));

  mapped.sort((a, b) => {
    const cmp = (b.date || "").localeCompare(a.date || "");
    if (cmp !== 0) return cmp;
    return b.id.localeCompare(a.id);
  });

  return mapped;
}

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Net GL balance for a bank ledger (debit − credit) through `asOfDateInclusive` (`YYYY-MM-DD`), all lines (cleared + uncleared).
 */
export async function fetchBankLedgerNetBalance(
  organizationId: string,
  bankLedgerId: string,
  asOfDateInclusive: string,
  supabase: SupabaseClient<Database>
): Promise<number> {
  if (!organizationId) throw new Error("organizationId is required");
  if (!bankLedgerId) throw new Error("bankLedgerId is required");
  const d = asOfDateInclusive?.trim();
  if (!d) throw new Error("asOfDateInclusive is required");

  const { data, error } = await supabase
    .from("journal_lines")
    .select(
      `
      debit_amount,
      credit_amount,
      journal_entries!inner (
        date,
        organization_id
      )
    `
    )
    .eq("account_id", bankLedgerId)
    .eq("journal_entries.organization_id", organizationId)
    .lte("journal_entries.date", d);

  if (error) throw error;

  const rows = (data ?? []) as Array<{
    debit_amount: number;
    credit_amount: number;
  }>;

  let net = 0;
  for (const r of rows) {
    net += Number(r.debit_amount ?? 0) - Number(r.credit_amount ?? 0);
  }
  return round2(net);
}

/**
 * Mark journal lines as reconciled (batch updates in chunks).
 * `reconciliationDate` should be an ISO date or datetime string accepted by Postgres `timestamptz`.
 */
export async function reconcileTransactions(
  lineIds: string[],
  reconciliationDate: string,
  supabase: SupabaseClient<Database>
): Promise<void> {
  if (!lineIds.length) return;
  if (!reconciliationDate?.trim()) throw new Error("reconciliationDate is required");

  const unique = [...new Set(lineIds.filter(Boolean))];
  if (!unique.length) return;

  for (let i = 0; i < unique.length; i += UPDATE_CHUNK) {
    const chunk = unique.slice(i, i + UPDATE_CHUNK);
    const { error } = await supabase
      .from("journal_lines")
      .update({
        is_reconciled: true,
        reconciliation_date: reconciliationDate.trim(),
      })
      .in("id", chunk);

    if (error) throw error;
  }
}
