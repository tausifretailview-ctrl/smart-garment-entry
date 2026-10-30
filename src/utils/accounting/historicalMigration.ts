import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { isAccountingEngineEnabled } from "@/utils/accounting/isAccountingEngineEnabled";
import { isHeldOrCancelledSale } from "@/utils/posHoldBill";
import {
  recordCustomerAdvanceReceiptJournalEntry,
  recordCustomerAdvanceRefundJournalEntry,
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
  /** Customer advance receipts and advance refunds with no journal yet */
  advances?: { ok: number; err: number };
  /**
   * Openings, balance adjustments and stock (posted by the database for shops switched on
   * with gl_enable_auto_postings): re-synced, shop not switched on, or SQL not run yet.
   */
  autoPostings?: "resynced" | "off" | "unavailable" | "failed";
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
 * POS used to post one advance-application journal for the whole amount, keyed to the last of
 * the FIFO vouchers, so the other vouchers of that split have no journal of their own. Posting
 * them again would use the advance twice. True when the live advance journals on this bill or
 * opening balance already cover all its live advance vouchers.
 */
async function advanceSplitAlreadyJournaled(
  organizationId: string,
  referenceId: string | null,
  client: SupabaseClient<Database>,
): Promise<boolean> {
  if (!referenceId) return false;
  const { data: siblings, error: sibErr } = await client
    .from("voucher_entries")
    .select("id, total_amount")
    .eq("organization_id", organizationId)
    .eq("reference_id", referenceId)
    .eq("payment_method", "advance_adjustment")
    .is("deleted_at", null);
  if (sibErr) throw sibErr;
  const ids = (siblings ?? []).map((s) => s.id as string);
  if (!ids.length) return false;
  const voucherTotal = (siblings ?? []).reduce((sum, s) => sum + Number(s.total_amount ?? 0), 0);

  const { data: journals, error: jeErr } = await client
    .from("journal_entries")
    .select("id, total_amount, reversed_journal_id")
    .eq("organization_id", organizationId)
    .eq("reference_type", "CustomerAdvanceApplication")
    .in("reference_id", ids);
  if (jeErr) throw jeErr;
  // Live originals only: leave out reversal rows and the originals they reversed.
  const reversedIds = new Set(
    (journals ?? []).map((j) => j.reversed_journal_id as string | null).filter((id): id is string => !!id),
  );
  const journaled = (journals ?? [])
    .filter((j) => !j.reversed_journal_id && !reversedIds.has(j.id as string))
    .reduce((sum, j) => sum + Number(j.total_amount ?? 0), 0);
  return journaled > 0 && journaled >= voucherTotal - 0.01;
}

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
      .select("id, net_amount, paid_amount, payment_method, payment_status, sale_number, is_cancelled, sale_date")
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
      // Held carts (F7 Hold, Hold/ numbers) are not sales yet; the bill posts when it is completed.
      if (isHeldOrCancelledSale(row)) continue;
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
        // Exchange returns go through the builder too: it journals those created after the
        // return-credit cutover and skips older ones (their bill's S/R adjust carried them).
        if (net <= 0) {
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
        .select("id, total_amount, voucher_type, reference_type, reference_id, payment_method")
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
          if (
            String(v.payment_method || "").toLowerCase() === "advance_adjustment" &&
            (await advanceSplitAlreadyJournaled(organizationId, v.reference_id as string | null, client))
          ) {
            summary.vouchers.skipped++;
            continue;
          }
          await repostJournalForRestoredVoucher(vid, client);
          summary.vouchers.ok++;
          postedVoucherIds.add(vid);
        } catch (e) {
          console.error("[historical backfill] voucher", vid, e);
          summary.vouchers.err++;
        }
      }

      if (vouchers.length < PAGE_SIZE) break;
      voucherOffset += PAGE_SIZE;
    }

    summary.advances = await backfillCustomerAdvanceJournals(organizationId, client);
    summary.autoPostings = await resyncAutoPostingsIfSwitchedOn(organizationId, client);
  }

  return summary;
}

async function loadPostedReferenceIds(
  organizationId: string,
  referenceTypes: string[],
  client: SupabaseClient<Database>,
): Promise<Set<string>> {
  const posted = new Set<string>();
  let offset = 0;
  for (;;) {
    const { data, error } = await client
      .from("journal_entries")
      .select("reference_id")
      .eq("organization_id", organizationId)
      .in("reference_type", referenceTypes)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) if (r.reference_id) posted.add(String(r.reference_id));
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return posted;
}

/**
 * Advance bookings and advance refunds are not vouchers, so the voucher pass never posted
 * them. Advances written by Customer Balance Adjustment are left out: that adjustment's own
 * journal carries them, and they are not money received.
 */
async function backfillCustomerAdvanceJournals(
  organizationId: string,
  client: SupabaseClient<Database>,
): Promise<{ ok: number; err: number }> {
  const result = { ok: 0, err: 0 };
  const posted = await loadPostedReferenceIds(
    organizationId,
    ["CustomerAdvanceReceipt", "CustomerAdvanceRefund"],
    client,
  );

  let offset = 0;
  for (;;) {
    const { data, error } = await client
      .from("customer_advances")
      .select("id, amount, payment_method, advance_date, advance_number, description")
      .eq("organization_id", organizationId)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const a of data) {
      const amount = Number(a.amount ?? 0);
      if (posted.has(a.id) || amount <= 0) continue;
      if (/^balance adjustment:/i.test(String(a.description ?? "").trim())) continue;
      try {
        await recordCustomerAdvanceReceiptJournalEntry(
          a.id,
          organizationId,
          amount,
          String(a.payment_method || "cash"),
          String(a.advance_date).slice(0, 10),
          String(a.description ?? "").trim() || `Advance ${a.advance_number ?? ""}`.trim(),
          client,
        );
        result.ok++;
      } catch (e) {
        console.error("[historical backfill] advance", a.id, e);
        result.err++;
      }
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  offset = 0;
  for (;;) {
    const { data, error } = await client
      .from("advance_refunds")
      .select("id, refund_amount, payment_method, refund_date, refund_number")
      .eq("organization_id", organizationId)
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const r of data) {
      const amount = Number(r.refund_amount ?? 0);
      if (posted.has(r.id) || amount <= 0) continue;
      try {
        await recordCustomerAdvanceRefundJournalEntry(
          r.id,
          organizationId,
          amount,
          String(r.payment_method || "cash"),
          String(r.refund_date).slice(0, 10),
          `Advance refund ${r.refund_number ?? ""}`.trim(),
          client,
        );
        result.ok++;
      } catch (e) {
        console.error("[historical backfill] advance refund", r.id, e);
        result.err++;
      }
    }
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  return result;
}

/** Re-sync the database postings (openings, balance adjustments, stock) of a switched-on shop. */
async function resyncAutoPostingsIfSwitchedOn(
  organizationId: string,
  client: SupabaseClient<Database>,
): Promise<HistoricalBackfillSummary["autoPostings"]> {
  const { data, error } = await (client as any)
    .from("gl_auto_posting_orgs")
    .select("organization_id")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) return "unavailable";
  if (!data) return "off";
  const { error: rpcErr } = await (client.rpc as any)("gl_enable_auto_postings", {
    p_organization_id: organizationId,
  });
  if (rpcErr) {
    console.error("[historical backfill] gl_enable_auto_postings", rpcErr);
    return "failed";
  }
  return "resynced";
}

/**
 * Re-post every sale and purchase bill with today's journal rules (after the Phase 1 fixes:
 * POS rate-below-MRP discount, purchase paid part). Only Sale and Purchase journals are
 * removed; receipts, payments, advances, deposits and manual journals stay as they are.
 */
export async function repostSalesAndPurchases(
  organizationId: string,
  client: SupabaseClient<Database>,
): Promise<HistoricalBackfillSummary> {
  if (!organizationId) throw new Error("organizationId is required");
  const { error: delErr } = await client
    .from("journal_entries")
    .delete()
    .eq("organization_id", organizationId)
    .in("reference_type", ["Sale", "Purchase"]);
  if (delErr) throw delErr;

  const { error: saleErr } = await client
    .from("sales")
    .update({ journal_status: "pending", journal_error: null })
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (saleErr) throw saleErr;

  const { error: purErr } = await client
    .from("purchase_bills")
    .update({ journal_status: "pending", journal_error: null })
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (purErr) throw purErr;

  return runHistoricalAccountingBackfill(organizationId, client);
}

export type AllOrgsBackfillProgress = {
  currentIndex: number;
  total: number;
  organizationName: string;
};

export type RunAllOrgsBackfillOptions = {
  onProgress?: (progress: AllOrgsBackfillProgress) => void;
};

/** Platform admin: backfill every organization (skips orgs where backfill throws). */
export async function runHistoricalAccountingBackfillAllOrganizations(
  client: SupabaseClient<Database>,
  options?: RunAllOrgsBackfillOptions,
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

  const orgList = orgs ?? [];
  const total = orgList.length;

  for (let i = 0; i < orgList.length; i++) {
    const org = orgList[i];
    const organizationId = org.id as string;
    const organizationName = String(org.name ?? organizationId);

    options?.onProgress?.({
      currentIndex: i + 1,
      total,
      organizationName,
    });

    // Let the UI repaint between organizations (long-running browser job).
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });

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

export function formatAllOrganizationsBackfillResult(
  result: AllOrganizationsBackfillResult,
): string {
  const totalOrgs = result.rows.length;
  return [
    `${totalOrgs} organization(s) scanned.`,
    `${result.organizationsProcessed} with GL engine processed,`,
    `${result.organizationsSkipped} skipped (engine off),`,
    `${result.organizationsFailed} failed.`,
  ].join(" ");
}

export function formatHistoricalBackfillSummary(summary: HistoricalBackfillSummary): string {
  const parts = [
    `Sales ${summary.sales.ok} ok / ${summary.sales.err} err`,
    `Purchases ${summary.purchases.ok} ok / ${summary.purchases.err} err`,
    `Returns ${summary.saleReturns.ok + summary.purchaseReturns.ok} ok`,
    `Vouchers ${summary.vouchers.ok} posted, ${summary.vouchers.skipped} skipped, ${summary.vouchers.err} err`,
  ];
  if (summary.advances) {
    parts.push(`Advances ${summary.advances.ok} posted, ${summary.advances.err} err`);
  }
  if (summary.autoPostings === "resynced") parts.push("Openings & stock re-synced");
  if (summary.autoPostings === "failed") parts.push("Openings & stock re-sync failed");
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
