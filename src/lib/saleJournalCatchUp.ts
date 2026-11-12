/**
 * Plan Phase 2, step 5: every bill gets its sale journal, even when the browser that saved it
 * never finished posting it.
 *
 * A bill is inserted with journal_status = 'pending' in the same database transaction as the
 * bill itself (column default). The journal is then posted from the browser right after the
 * save (postSaleJournalInBackground). If that tab closes, the connection drops or the post
 * fails, the bill used to wait until someone ran Accounts → Accounting migration.
 *
 * The catch-up posts those bills from any open screen of the shop, with the SAME builder
 * (recordSaleJournalEntry) as the save and the backfill, so there is one set of accounting
 * rules. postJournalEntry keeps one live journal per bill, so two tabs or the save itself
 * racing the catch-up never post twice.
 *
 * Only bills from the last 48 hours, at least 2 minutes old (the save's own post goes first).
 * Older pending bills are left to the Accounting migration card: posting history is a choice
 * the shop makes there, not something to start silently.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { isHeldOrCancelledSale } from "@/utils/posHoldBill";

export const JOURNAL_CATCH_UP_MIN_AGE_MS = 2 * 60 * 1000;
export const JOURNAL_CATCH_UP_WINDOW_MS = 48 * 60 * 60 * 1000;
export const JOURNAL_CATCH_UP_BATCH = 20;

export type CatchUpSaleRow = {
  id: string;
  sale_date?: string | null;
  sale_number?: string | null;
  net_amount?: number | null;
  payment_method?: string | null;
  payment_status?: string | null;
  is_cancelled?: boolean | null;
};

export type CatchUpClient = SupabaseClient;

/** The created_at window to look in: [now - 48 h, now - 2 min]. */
export function journalCatchUpWindow(now: number): { from: string; to: string } {
  return {
    from: new Date(now - JOURNAL_CATCH_UP_WINDOW_MS).toISOString(),
    to: new Date(now - JOURNAL_CATCH_UP_MIN_AGE_MS).toISOString(),
  };
}

/** Bills of this shop that still need their sale journal (held / cancelled / ₹0 left out). */
export async function findSalesNeedingJournal(
  client: CatchUpClient,
  organizationId: string,
  now = Date.now(),
): Promise<CatchUpSaleRow[]> {
  const { from, to } = journalCatchUpWindow(now);
  const { data, error } = await client
    .from("sales")
    .select("id, sale_date, sale_number, net_amount, payment_method, payment_status, is_cancelled")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .eq("is_cancelled", false)
    .in("journal_status", ["pending", "failed"])
    .gt("net_amount", 0)
    .gte("created_at", from)
    .lte("created_at", to)
    .order("created_at", { ascending: true })
    .limit(JOURNAL_CATCH_UP_BATCH);
  if (error) throw error;
  return ((data || []) as CatchUpSaleRow[]).filter((row) => row.id && !isHeldOrCancelledSale(row));
}

export type JournalCatchUpResult = { checked: number; posted: number; failed: number };

/**
 * Post the journals of the bills found. One at a time (no burst on the server); a failure is
 * written to journal_status / journal_error like the save's own post, and tried again next run.
 */
export async function runSaleJournalCatchUp(
  client: CatchUpClient,
  organizationId: string,
  postSaleJournal: (saleId: string, organizationId: string, saleDate?: string) => Promise<unknown>,
  now = Date.now(),
): Promise<JournalCatchUpResult> {
  const rows = await findSalesNeedingJournal(client, organizationId, now);
  const result: JournalCatchUpResult = { checked: rows.length, posted: 0, failed: 0 };
  for (const row of rows) {
    try {
      await postSaleJournal(row.id, organizationId, row.sale_date ? String(row.sale_date).slice(0, 10) : undefined);
      await client
        .from("sales")
        .update({ journal_status: "posted", journal_error: null })
        .eq("id", row.id)
        .eq("organization_id", organizationId);
      result.posted += 1;
    } catch (err) {
      result.failed += 1;
      const message = err instanceof Error ? err.message : String(err || "Failed to post journal");
      await client
        .from("sales")
        .update({ journal_status: "failed", journal_error: message.slice(0, 2000) })
        .eq("id", row.id)
        .eq("organization_id", organizationId);
    }
  }
  return result;
}
