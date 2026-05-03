import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import {
  recordExpenseVoucherJournalEntry,
  recordPurchaseJournalEntry,
  recordPurchaseReturnJournalEntry,
  recordSaleJournalEntry,
  recordSaleReturnJournalEntry,
} from "@/utils/accounting/journalService";

export type HistoricalBackfillSummary = {
  sales: { ok: number; err: number };
  purchases: { ok: number; err: number };
  expenses: { ok: number; err: number };
  saleReturns: { ok: number; err: number };
  purchaseReturns: { ok: number; err: number };
};

function journalErrorMessage(e: unknown, maxLen = 2000): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.length > maxLen ? msg.slice(0, maxLen) : msg;
}

const PAGE_SIZE = 500;

/**
 * Post journals for legacy rows that never left `pending` (sales, purchase_bills, sale_returns, purchase_returns)
 * and expense vouchers that have no `journal_entries` row yet. Per-row try/catch so one bad row does not stop the batch.
 */
export async function runHistoricalAccountingBackfill(
  organizationId: string,
  client: SupabaseClient<Database>
): Promise<HistoricalBackfillSummary> {
  const summary: HistoricalBackfillSummary = {
    sales: { ok: 0, err: 0 },
    purchases: { ok: 0, err: 0 },
    expenses: { ok: 0, err: 0 },
    saleReturns: { ok: 0, err: 0 },
    purchaseReturns: { ok: 0, err: 0 },
  };

  if (!organizationId) return summary;

  // —— Sales ——
  let saleOffset = 0;
  for (;;) {
    const { data: salesRows, error: saleErr } = await client
      .from("sales")
      .select("id, net_amount, paid_amount, payment_method, sale_date")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("is_cancelled", false)
      .eq("journal_status", "pending")
      .order("id", { ascending: true })
      .range(saleOffset, saleOffset + PAGE_SIZE - 1);

    if (saleErr) throw saleErr;
    if (!salesRows?.length) break;

    for (const row of salesRows) {
      const id = row.id as string;
      try {
        const net = Number(row.net_amount ?? 0);
        if (net <= 0) {
          await client
            .from("sales")
            .update({ journal_status: "posted", journal_error: null })
            .eq("id", id);
          summary.sales.ok++;
          continue;
        }
        await recordSaleJournalEntry(
          id,
          organizationId,
          net,
          Number(row.paid_amount ?? 0),
          String(row.payment_method ?? "pay_later"),
          client,
          row.sale_date != null ? String(row.sale_date).slice(0, 10) : undefined
        );
        await client.from("sales").update({ journal_status: "posted", journal_error: null }).eq("id", id);
        summary.sales.ok++;
      } catch (e) {
        console.error("[historical backfill] sale", id, e);
        summary.sales.err++;
      }
    }

    if (salesRows.length < PAGE_SIZE) break;
    saleOffset += PAGE_SIZE;
  }

  // —— Purchases ——
  let purchaseOffset = 0;
  for (;;) {
    const { data: purchaseRows, error: purchaseErr } = await client
      .from("purchase_bills")
      .select("id, net_amount, paid_amount, bill_date")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("is_cancelled", false)
      .eq("journal_status", "pending")
      .order("id", { ascending: true })
      .range(purchaseOffset, purchaseOffset + PAGE_SIZE - 1);

    if (purchaseErr) throw purchaseErr;
    if (!purchaseRows?.length) break;

    for (const row of purchaseRows) {
      const id = row.id as string;
      try {
        const net = Number(row.net_amount ?? 0);
        if (net <= 0) {
          await client
            .from("purchase_bills")
            .update({ journal_status: "posted", journal_error: null })
            .eq("id", id);
          summary.purchases.ok++;
          continue;
        }
        await recordPurchaseJournalEntry(
          id,
          organizationId,
          net,
          Number(row.paid_amount ?? 0),
          "pay_later",
          client,
          row.bill_date != null ? String(row.bill_date).slice(0, 10) : undefined
        );
        await client
          .from("purchase_bills")
          .update({ journal_status: "posted", journal_error: null })
          .eq("id", id);
        summary.purchases.ok++;
      } catch (e) {
        console.error("[historical backfill] purchase", id, e);
        summary.purchases.err++;
      }
    }

    if (purchaseRows.length < PAGE_SIZE) break;
    purchaseOffset += PAGE_SIZE;
  }

  // —— Sale returns ——
  let saleReturnOffset = 0;
  for (;;) {
    const { data: srRows, error: srErr } = await client
      .from("sale_returns")
      .select("id, net_amount, refund_type, return_date, payment_method")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("journal_status", "pending")
      .order("id", { ascending: true })
      .range(saleReturnOffset, saleReturnOffset + PAGE_SIZE - 1);

    if (srErr) throw srErr;
    if (!srRows?.length) break;

    for (const row of srRows) {
      const id = row.id as string;
      try {
        const net = Number(row.net_amount ?? 0);
        const refundType = String(row.refund_type ?? "credit_note");
        if (net <= 0 || refundType.toLowerCase().trim() === "exchange") {
          await client
            .from("sale_returns")
            .update({ journal_status: "posted", journal_error: null })
            .eq("id", id);
          summary.saleReturns.ok++;
          continue;
        }
        const dateStr =
          row.return_date != null ? String(row.return_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
        await recordSaleReturnJournalEntry(
          id,
          organizationId,
          net,
          refundType,
          dateStr,
          `Historical backfill sale return`,
          client,
          (row as { payment_method?: string | null }).payment_method ?? null
        );
        await client.from("sale_returns").update({ journal_status: "posted", journal_error: null }).eq("id", id);
        summary.saleReturns.ok++;
      } catch (e) {
        console.error("[historical backfill] sale_return", id, e);
        await client
          .from("sale_returns")
          .update({ journal_status: "failed", journal_error: journalErrorMessage(e) })
          .eq("id", id);
        summary.saleReturns.err++;
      }
    }

    if (srRows.length < PAGE_SIZE) break;
    saleReturnOffset += PAGE_SIZE;
  }

  // —— Purchase returns ——
  let purchaseReturnOffset = 0;
  for (;;) {
    const { data: prRows, error: prErr } = await client
      .from("purchase_returns")
      .select("id, net_amount, return_date, payment_method")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("journal_status", "pending")
      .order("id", { ascending: true })
      .range(purchaseReturnOffset, purchaseReturnOffset + PAGE_SIZE - 1);

    if (prErr) throw prErr;
    if (!prRows?.length) break;

    for (const row of prRows) {
      const id = row.id as string;
      try {
        const net = Number(row.net_amount ?? 0);
        if (net <= 0) {
          await client
            .from("purchase_returns")
            .update({ journal_status: "posted", journal_error: null })
            .eq("id", id);
          summary.purchaseReturns.ok++;
          continue;
        }
        const dateStr =
          row.return_date != null ? String(row.return_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
        await recordPurchaseReturnJournalEntry(
          id,
          organizationId,
          net,
          dateStr,
          `Historical backfill purchase return`,
          client,
          (row as { payment_method?: string | null }).payment_method ?? null
        );
        await client.from("purchase_returns").update({ journal_status: "posted", journal_error: null }).eq("id", id);
        summary.purchaseReturns.ok++;
      } catch (e) {
        console.error("[historical backfill] purchase_return", id, e);
        await client
          .from("purchase_returns")
          .update({ journal_status: "failed", journal_error: journalErrorMessage(e) })
          .eq("id", id);
        summary.purchaseReturns.err++;
      }
    }

    if (prRows.length < PAGE_SIZE) break;
    purchaseReturnOffset += PAGE_SIZE;
  }

  // —— Expense vouchers (no journal_status on voucher_entries; skip if journal already exists) ——
  const postedExpenseVoucherIds = new Set<string>();
  let jeOffset = 0;
  for (;;) {
    const { data: jeRows, error: jeErr } = await client
      .from("journal_entries")
      .select("reference_id")
      .eq("organization_id", organizationId)
      .eq("reference_type", "ExpenseVoucher")
      .order("id", { ascending: true })
      .range(jeOffset, jeOffset + PAGE_SIZE - 1);

    if (jeErr) throw jeErr;
    if (!jeRows?.length) break;
    for (const r of jeRows) {
      if (r.reference_id) postedExpenseVoucherIds.add(String(r.reference_id));
    }
    if (jeRows.length < PAGE_SIZE) break;
    jeOffset += PAGE_SIZE;
  }

  const { data: categories, error: catErr } = await client
    .from("expense_categories")
    .select("name, ledger_account_id")
    .eq("organization_id", organizationId);

  if (catErr) throw catErr;
  const categoryToLedger = new Map<string, string | null>();
  for (const c of categories ?? []) {
    categoryToLedger.set(String(c.name), c.ledger_account_id ?? null);
  }

  let voucherOffset = 0;
  for (;;) {
    const { data: vouchers, error: vErr } = await client
      .from("voucher_entries")
      .select("id, total_amount, payment_method, voucher_date, category, description")
      .eq("organization_id", organizationId)
      .eq("voucher_type", "expense")
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(voucherOffset, voucherOffset + PAGE_SIZE - 1);

    if (vErr) throw vErr;
    if (!vouchers?.length) break;

    for (const v of vouchers) {
      const vid = v.id as string;
      if (postedExpenseVoucherIds.has(vid)) continue;

      try {
        const amt = Number(v.total_amount ?? 0);
        if (amt <= 0) {
          summary.expenses.ok++;
          continue;
        }
        const cat = v.category != null ? String(v.category) : "";
        const mappedLedgerId = cat ? categoryToLedger.get(cat) ?? undefined : undefined;
        const dateStr = v.voucher_date != null ? String(v.voucher_date).slice(0, 10) : undefined;
        if (!dateStr) {
          summary.expenses.err++;
          console.error("[historical backfill] expense missing voucher_date", vid);
          continue;
        }
        await recordExpenseVoucherJournalEntry(
          vid,
          organizationId,
          amt,
          String(v.payment_method ?? "cash"),
          dateStr,
          v.description != null && String(v.description).trim() !== ""
            ? String(v.description)
            : cat || "Expense",
          client,
          mappedLedgerId ?? null
        );
        summary.expenses.ok++;
      } catch (e) {
        console.error("[historical backfill] expense voucher", vid, e);
        summary.expenses.err++;
      }
    }

    if (vouchers.length < PAGE_SIZE) break;
    voucherOffset += PAGE_SIZE;
  }

  return summary;
}

export type AdminResetOrgGlResult = {
  ok?: boolean;
  journal_lines_deleted?: number;
  journal_entries_deleted?: number;
};

/** Deletes all journal_lines / journal_entries for the org and resets sale & purchase journal_status to pending (RPC). */
export async function resetOrganizationGlLedger(
  organizationId: string,
  client: SupabaseClient<Database>
): Promise<AdminResetOrgGlResult> {
  const { data, error } = await client.rpc("admin_reset_org_gl", { p_org_id: organizationId });
  if (error) throw error;
  return (data ?? {}) as AdminResetOrgGlResult;
}
