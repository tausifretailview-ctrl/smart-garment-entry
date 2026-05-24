import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import {
  recordPurchaseJournalEntry,
  recordPurchaseReturnJournalEntry,
  recordSaleJournalEntry,
  recordSaleReturnJournalEntry,
  repostJournalForRestoredVoucher,
} from "@/utils/accounting/journalService";

export type HistoricalBackfillSummary = {
  sales: { ok: number; err: number };
  purchases: { ok: number; err: number };
  /** Receipts, supplier payments, salaries, and expense vouchers */
  vouchers: { ok: number; err: number; skipped: number };
  saleReturns: { ok: number; err: number };
  purchaseReturns: { ok: number; err: number };
  accountingEngineEnabled: boolean;
};

export type PendingGlBackfillCounts = {
  pendingSales: number;
  pendingPurchases: number;
  pendingSaleReturns: number;
  pendingPurchaseReturns: number;
  failedSales: number;
  failedPurchases: number;
  vouchersWithoutJournal: number;
  totalPending: number;
  totalFailed: number;
  accountingEngineEnabled: boolean;
};

const EMPTY_PENDING_COUNTS: PendingGlBackfillCounts = {
  pendingSales: 0,
  pendingPurchases: 0,
  pendingSaleReturns: 0,
  pendingPurchaseReturns: 0,
  failedSales: 0,
  failedPurchases: 0,
  vouchersWithoutJournal: 0,
  totalPending: 0,
  totalFailed: 0,
  accountingEngineEnabled: true,
};

export async function fetchPendingGlBackfillCounts(
  organizationId: string,
  client: SupabaseClient<Database>,
): Promise<PendingGlBackfillCounts> {
  if (!organizationId) return { ...EMPTY_PENDING_COUNTS };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.rpc as any)("get_pending_gl_backfill_counts", {
    p_org_id: organizationId,
  });
  if (error) throw error;

  const row = (data ?? {}) as Record<string, unknown>;
  return {
    pendingSales: Number(row.pending_sales ?? 0),
    pendingPurchases: Number(row.pending_purchases ?? 0),
    pendingSaleReturns: Number(row.pending_sale_returns ?? 0),
    pendingPurchaseReturns: Number(row.pending_purchase_returns ?? 0),
    failedSales: Number(row.failed_sales ?? 0),
    failedPurchases: Number(row.failed_purchases ?? 0),
    vouchersWithoutJournal: Number(row.vouchers_without_journal ?? 0),
    totalPending: Number(row.total_pending ?? 0),
    totalFailed: Number(row.total_failed ?? 0),
    accountingEngineEnabled: Boolean(row.accounting_engine_enabled ?? true),
  };
}

export type AllOrganizationsBackfillResult = {
  organizationsProcessed: number;
  organizationsSkipped: number;
  organizationsFailed: number;
  rows: Array<{
    organizationId: string;
    organizationName: string;
    summary: HistoricalBackfillSummary;
    error?: string;
  }>;
};

/** Journal reference types that point at voucher_entries.id */
const VOUCHER_JOURNAL_REFERENCE_TYPES = [
  "CustomerReceipt",
  "SupplierPayment",
  "ExpenseVoucher",
  "SalaryVoucher",
  "StudentFeeReceipt",
  "CustomerCreditNoteApplication",
  "CustomerAdvanceApplication",
  "Payment",
] as const;

function journalErrorMessage(e: unknown, maxLen = 2000): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.length > maxLen ? msg.slice(0, maxLen) : msg;
}

const PAGE_SIZE = 500;

/**
 * Post journals for legacy rows that never left `pending` (sales, purchase_bills, sale_returns, purchase_returns)
 * and expense vouchers that have no `journal_entries` row yet. Per-row try/catch so one bad row does not stop the batch.
 */
async function loadVoucherIdsWithPostedJournals(
  organizationId: string,
  client: SupabaseClient<Database>,
): Promise<Set<string>> {
  const posted = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data: jeRows, error: jeErr } = await client
      .from("journal_entries")
      .select("reference_id")
      .eq("organization_id", organizationId)
      .in("reference_type", [...VOUCHER_JOURNAL_REFERENCE_TYPES])
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (jeErr) throw jeErr;
    if (!jeRows?.length) break;
    for (const r of jeRows) {
      if (r.reference_id) posted.add(String(r.reference_id));
    }
    if (jeRows.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return posted;
}

export async function runHistoricalAccountingBackfill(
  organizationId: string,
  client: SupabaseClient<Database>
): Promise<HistoricalBackfillSummary> {
  const summary: HistoricalBackfillSummary = {
    sales: { ok: 0, err: 0 },
    purchases: { ok: 0, err: 0 },
    vouchers: { ok: 0, err: 0, skipped: 0 },
    saleReturns: { ok: 0, err: 0 },
    purchaseReturns: { ok: 0, err: 0 },
    accountingEngineEnabled: false,
  };

  if (!organizationId) return summary;

  const { data: settings, error: settingsErr } = await client
    .from("settings")
    .select("accounting_engine_enabled")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (settingsErr) throw settingsErr;

  summary.accountingEngineEnabled = isAccountingEngineEnabled(
    settings as { accounting_engine_enabled?: boolean } | null,
  );

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

  // —— Vouchers (expense, salary, customer receipt, supplier payment, advance/CN) ——
  if (summary.accountingEngineEnabled) {
    const postedVoucherIds = await loadVoucherIdsWithPostedJournals(organizationId, client);
    let voucherOffset = 0;
    for (;;) {
      const { data: vouchers, error: vErr } = await client
        .from("voucher_entries")
        .select("id, total_amount, voucher_type, reference_type, payment_method")
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(voucherOffset, voucherOffset + PAGE_SIZE - 1);

      if (vErr) throw vErr;
      if (!vouchers?.length) break;

      for (const v of vouchers) {
        const vid = v.id as string;
        if (postedVoucherIds.has(vid)) {
          summary.vouchers.skipped++;
          continue;
        }

        const amt = Number(v.total_amount ?? 0);
        if (amt <= 0) {
          summary.vouchers.skipped++;
          continue;
        }

        try {
          await repostJournalForRestoredVoucher(vid, client);
          const { count, error: checkErr } = await client
            .from("journal_entries")
            .select("id", { count: "exact", head: true })
            .eq("organization_id", organizationId)
            .eq("reference_id", vid);

          if (checkErr) throw checkErr;
          if ((count ?? 0) > 0) {
            summary.vouchers.ok++;
            postedVoucherIds.add(vid);
          } else {
            summary.vouchers.skipped++;
          }
        } catch (e) {
          console.error("[historical backfill] voucher", vid, e);
          summary.vouchers.err++;
        }
      }

      if (vouchers.length < PAGE_SIZE) break;
      voucherOffset += PAGE_SIZE;
    }
  }

  return summary;
}

/** Platform admin: backfill every organization (skips orgs where backfill throws). */
export async function runHistoricalAccountingBackfillAllOrganizations(
  client: SupabaseClient<Database>,
): Promise<AllOrganizationsBackfillResult> {
  const result: AllOrganizationsBackfillResult = {
    organizationsProcessed: 0,
    organizationsSkipped: 0,
    organizationsFailed: 0,
    rows: [],
  };

  const { data: orgs, error } = await client
    .from("organizations")
    .select("id, name")
    .order("name", { ascending: true });

  if (error) throw error;

  for (const org of orgs ?? []) {
    const organizationId = org.id as string;
    const organizationName = String(org.name ?? organizationId);
    try {
      const summary = await runHistoricalAccountingBackfill(organizationId, client);
      result.rows.push({ organizationId, organizationName, summary });
      if (!summary.accountingEngineEnabled) {
        result.organizationsSkipped++;
      } else {
        result.organizationsProcessed++;
      }
    } catch (e) {
      result.organizationsFailed++;
      result.rows.push({
        organizationId,
        organizationName,
        summary: {
          sales: { ok: 0, err: 0 },
          purchases: { ok: 0, err: 0 },
          vouchers: { ok: 0, err: 0, skipped: 0 },
          saleReturns: { ok: 0, err: 0 },
          purchaseReturns: { ok: 0, err: 0 },
          accountingEngineEnabled: false,
        },
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return result;
}

export function formatHistoricalBackfillSummary(summary: HistoricalBackfillSummary): string {
  const parts = [
    `Sales ${summary.sales.ok} ok / ${summary.sales.err} err`,
    `Purchases ${summary.purchases.ok} ok / ${summary.purchases.err} err`,
    `Returns ${summary.saleReturns.ok + summary.purchaseReturns.ok} ok`,
    `Vouchers ${summary.vouchers.ok} posted, ${summary.vouchers.skipped} skipped, ${summary.vouchers.err} err`,
  ];
  if (!summary.accountingEngineEnabled) {
    parts.push("GL engine off — voucher journals skipped");
  }
  return parts.join(" · ");
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client.rpc as any)("admin_reset_org_gl", { p_org_id: organizationId });
  if (error) throw error;
  return (data ?? {}) as AdminResetOrgGlResult;
}
