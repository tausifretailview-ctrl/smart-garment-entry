/**
 * Phase 0 — measure customer-balance formula drift (no writes).
 *
 * Compares, per org:
 *   A) get_customer_party_balances            (list + KPI cards)
 *   B) get_customer_financial_snapshot_all    (SQL snapshot RPC)
 *   C) getCustomerAccountState                (ledger first-paint / list enrich)
 *   D) ledger transaction recon               (ledger final Outstanding)
 *
 * Tradeoff vs 7,772 per-customer audit bundles:
 *   C is computed from one org-wide table dump (sales / vouchers / SR / advances).
 *   D is fetched only for customers where A/B/C already disagree by > ₹1
 *   (or --recon-all to force every party — slow).
 *
 * Auth (same as scripts/prove-snapshot-all-equivalence.mjs):
 *   VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY from .env
 *   SUPABASE_ACCESS_TOKEN = EzzyERP user JWT (not a management PAT)
 *   ORG_ID or ORG_IDS=uuid,uuid
 *
 *   npx vite-node scripts/phase0-customer-balance-triple-drift.ts
 *
 * Exit 2 = missing JWT (cannot scan production as anon).
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  buildOrgCustomerBalanceBatch,
  getCustomerAccountState,
} from "../src/utils/customerBalanceCore";
import {
  alignPartyRowFromRpc,
  partyBalanceRowFacets,
  type CustomerPartyBalanceRpcRow,
} from "../src/utils/customerPartyBalanceSnapshot";
import { summarizeAccountFacets } from "../src/utils/customerAccountFacets";
import { fetchItemsGrossBySaleId } from "../src/utils/fetchItemsGrossBySaleId";
import { fetchCustomerLedgerTransactionsWithClient } from "../src/utils/customerLedgerTransactions";
import {
  computeInvoiceOutstandingFromReconciliation,
  saleReturnCreditForReconciliation,
} from "../src/utils/customerLedgerReconciliation";

function loadEnv() {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}

loadEnv();

const PAGE = 1000;
const EPS = 1;
const ELLA_NOOR = "3fdca631-1e0c-4417-9704-421f5129ff67";

function orgIdsFromEnv(): string[] {
  if (process.env.ORG_IDS) {
    return process.env.ORG_IDS.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [process.env.ORG_ID, process.env.ORG_ID_2, process.env.ORG_ID_3]
    .filter(Boolean) as string[];
}

async function pageTable(
  supabase: SupabaseClient,
  table: string,
  columns: string,
  apply: (q: any) => any,
): Promise<any[]> {
  const rows: any[] = [];
  let offset = 0;
  for (;;) {
    let q = supabase.from(table).select(columns);
    q = apply(q);
    const { data, error } = await q.range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

async function pageRpc(supabase: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const rows: any[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.rpc(fn as never, args as never).range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...(data as any[]));
    if ((data as any[]).length < PAGE) break;
    offset += PAGE;
  }
  return rows;
}

function rupee(n: number) {
  return Math.round(Number(n) || 0);
}

function ledgerReconOutstanding(txns: Array<{
  id?: string;
  informational?: boolean;
  type?: string;
  debit?: number;
  credit?: number;
  displayDebit?: number;
  displayCredit?: number;
  grossBill?: number;
  saleReturnAdjustApplied?: number;
  paymentBreakdown?: { cashReceived?: number; settlementDiscount?: number };
  appliedAmount?: number;
}>) {
  let opening = 0;
  let grossInvoiced = 0;
  let saleReturns = 0;
  let paymentsCash = 0;
  let paymentsDiscount = 0;
  let invoiceCnApplied = 0;
  let advanceApplied = 0;
  let cnRefunded = 0;
  let adjustments = 0;
  for (const t of txns) {
    if (t.id === "opening-balance") {
      opening = (t.debit || 0) - (t.credit || 0);
      continue;
    }
    if (t.informational) continue;
    if (t.type === "invoice") {
      grossInvoiced += t.grossBill ?? t.displayDebit ?? t.debit ?? 0;
      invoiceCnApplied += t.saleReturnAdjustApplied ?? 0;
    } else if (t.type === "return") {
      saleReturns += saleReturnCreditForReconciliation(t);
    } else if (t.type === "payment") {
      const discount = t.paymentBreakdown?.settlementDiscount || 0;
      const cash =
        t.paymentBreakdown?.cashReceived != null
          ? t.paymentBreakdown.cashReceived
          : Math.max(0, (t.credit || 0) - discount);
      paymentsCash += cash;
      paymentsDiscount += discount;
    } else if (t.type === "advance_application") {
      advanceApplied += t.appliedAmount || 0;
    } else if (t.type === "cn_refund" || t.type === "refund") {
      cnRefunded += t.debit || 0;
    } else if (t.type === "adjustment") {
      adjustments += (t.debit || 0) - (t.credit || 0);
    }
  }
  return computeInvoiceOutstandingFromReconciliation({
    opening,
    grossInvoiced,
    invoiceCnApplied,
    saleReturns,
    paymentsCash,
    paymentsDiscount,
    advanceApplied,
    adjustments,
    cnRefunded,
  });
}

function classifyShape(row: {
  party: number;
  core: number;
  snap: number | null;
  recon: number | null;
  leftoverSr: number;
  refundDebits: number;
  splitCn: boolean;
  unusedAdvance: number;
}): string {
  if (row.splitCn) return "split_cn_last_write_wins";
  if (row.refundDebits > 1 && row.leftoverSr > 1) return "refund_on_applied_return";
  if (row.leftoverSr > 1) return "leftover_sr_credit";
  if (Math.abs(row.party - row.core) > EPS && row.unusedAdvance > 1) return "advance_facet";
  if (row.snap != null && Math.abs(row.party - row.snap) > EPS) return "sql_party_vs_snapshot_all";
  if (row.recon != null && Math.abs(row.core - row.recon) > EPS) return "core_vs_ledger_recon";
  return "other";
}

async function poolMap<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

async function measureOrg(supabase: SupabaseClient, orgId: string, reconAll: boolean) {
  const started = Date.now();
  const partyRows = (await pageRpc(supabase, "get_customer_party_balances", {
    p_organization_id: orgId,
  })) as CustomerPartyBalanceRpcRow[];

  let snapshotRows: any[] = [];
  let snapshotError: string | null = null;
  try {
    snapshotRows = await pageRpc(supabase, "get_customer_financial_snapshot_all", {
      p_organization_id: orgId,
    });
  } catch (e) {
    snapshotError = e instanceof Error ? e.message : String(e);
  }
  const snapById = new Map(
    snapshotRows.map((r) => [String(r.customer_id), rupee(r.outstanding_dr ?? r.net_position ?? 0)]),
  );

  const customers = await pageTable(
    supabase,
    "customers",
    "id, customer_name, opening_balance",
    (q) => q.eq("organization_id", orgId).is("deleted_at", null),
  );
  const customerIds = new Set(customers.map((c: { id: string }) => c.id));
  const openingById = new Map(
    customers.map((c: { id: string; opening_balance?: number }) => [
      c.id,
      rupee(c.opening_balance || 0),
    ]),
  );
  const nameById = new Map(
    customers.map((c: { id: string; customer_name?: string }) => [c.id, String(c.customer_name || "")]),
  );

  const sales = await pageTable(
    supabase,
    "sales",
    "id, customer_id, net_amount, paid_amount, cash_amount, card_amount, upi_amount, sale_return_adjust, payment_status, is_cancelled",
    (q) => q.eq("organization_id", orgId).is("deleted_at", null),
  );
  const itemsGross = await fetchItemsGrossBySaleId(
    supabase,
    sales.map((s: { id: string }) => s.id),
  );
  const salesWithGross = sales.map((s: any) => ({
    ...s,
    items_gross: itemsGross.get(s.id) || 0,
  }));

  const vouchers = await pageTable(
    supabase,
    "voucher_entries",
    "voucher_type, reference_type, reference_id, total_amount, discount_amount, payment_method, description",
    (q) =>
      q
        .eq("organization_id", orgId)
        .is("deleted_at", null)
        .in("voucher_type", ["receipt", "payment", "credit_note"]),
  );
  const advances = await pageTable(
    supabase,
    "customer_advances",
    "id, customer_id, amount, used_amount",
    (q) => q.eq("organization_id", orgId),
  );
  const advanceIds = advances.map((a: { id: string }) => a.id);
  const refundsRaw: Array<{ advance_id?: string; refund_amount?: number }> = [];
  for (let i = 0; i < advanceIds.length; i += 200) {
    const chunk = advanceIds.slice(i, i + 200);
    if (!chunk.length) break;
    const { data, error } = await supabase
      .from("advance_refunds")
      .select("advance_id, refund_amount")
      .in("advance_id", chunk);
    if (error) throw error;
    refundsRaw.push(...((data as any[]) || []));
  }
  const advanceCustomer = new Map(
    advances.map((a: { id: string; customer_id: string }) => [a.id, a.customer_id]),
  );
  const refunds = refundsRaw
    .map((r) => ({
      customer_id: advanceCustomer.get(String(r.advance_id || "")) || "",
      refund_amount: r.refund_amount,
    }))
    .filter((r) => r.customer_id);

  const adjustments = await pageTable(
    supabase,
    "customer_balance_adjustments",
    "customer_id, outstanding_difference",
    (q) => q.eq("organization_id", orgId),
  );
  const saleReturns = await pageTable(
    supabase,
    "sale_returns",
    "id, customer_id, net_amount, credit_status, linked_sale_id, credit_available_balance, refund_type",
    (q) => q.eq("organization_id", orgId).is("deleted_at", null),
  );

  const batch = buildOrgCustomerBalanceBatch({
    sales: salesWithGross,
    vouchers,
    advances,
    refunds,
    adjustments,
    saleReturns,
    customerIds,
  });

  const sraByCustomer = new Map<string, number>();
  for (const s of sales) {
    const cid = String(s.customer_id || "");
    if (Number(s.sale_return_adjust || 0) > 1) {
      sraByCustomer.set(cid, (sraByCustomer.get(cid) || 0) + 1);
    }
  }
  const leftoverByCustomer = new Map<string, number>();
  const splitCnCustomers = new Set<string>();
  for (const sr of saleReturns) {
    const cid = String(sr.customer_id || "");
    const remaining = Math.max(
      0,
      Number(sr.credit_available_balance ?? sr.net_amount ?? 0),
    );
    leftoverByCustomer.set(cid, (leftoverByCustomer.get(cid) || 0) + remaining);
    if ((sraByCustomer.get(cid) || 0) >= 2 && remaining > 1) splitCnCustomers.add(cid);
  }
  const refundDebitByCustomer = new Map<string, number>();
  for (const v of vouchers) {
    if (String(v.voucher_type || "").toLowerCase() !== "payment") continue;
    if (String(v.reference_type || "").toLowerCase() !== "customer") continue;
    const cid = String(v.reference_id || "");
    refundDebitByCustomer.set(
      cid,
      (refundDebitByCustomer.get(cid) || 0) + Math.max(0, Number(v.total_amount || 0)),
    );
  }

  const partyAligned = partyRows.map((r) => alignPartyRowFromRpc(r, ""));
  const partyKpi = summarizeAccountFacets(partyAligned.map((r) => partyBalanceRowFacets(r)));

  type Row = {
    customer_id: string;
    customer_name: string;
    party: number;
    snap: number | null;
    core: number;
    recon: number | null;
    d_party_core: number;
    d_party_snap: number | null;
    d_core_recon: number | null;
    leftoverSr: number;
    refundDebits: number;
    splitCn: boolean;
    unusedAdvance: number;
    shape: string;
  };

  const compared: Row[] = [];
  for (const p of partyAligned) {
    const id = p.customer_id;
    const state = getCustomerAccountState({
      openingBalance: openingById.get(id) || 0,
      customerId: id,
      sales: batch.salesByCustomerId.get(id) || [],
      voucherEntries: batch.vouchersByCustomerId.get(id) || [],
      customerAdvances: batch.advancesByCustomerId.get(id) || [],
      advanceRefunds: batch.refundsByCustomerId.get(id) || [],
      adjustmentTotal: batch.adjustmentsByCustomerId.get(id) || 0,
      saleReturns: batch.saleReturnsByCustomerId.get(id) || [],
      options: { ledgerAlignedApplicationReceipts: true },
    });
    const partyNet = rupee(p.net_position);
    const coreNet = rupee(state.netPosition);
    const snap = snapById.has(id) ? snapById.get(id)! : null;
    const leftoverSr = rupee(leftoverByCustomer.get(id) || 0);
    const refundDebits = rupee(refundDebitByCustomer.get(id) || 0);
    const splitCn = splitCnCustomers.has(id);
    compared.push({
      customer_id: id,
      customer_name: nameById.get(id) || p.customer_name,
      party: partyNet,
      snap,
      core: coreNet,
      recon: null,
      d_party_core: partyNet - coreNet,
      d_party_snap: snap == null ? null : partyNet - snap,
      d_core_recon: null,
      leftoverSr,
      refundDebits,
      splitCn,
      unusedAdvance: rupee(state.unusedAdvancePool),
      shape: "",
    });
  }

  // List KPIs sum party facets. Compare the same facet helper on JS netPosition
  // (already economic net) so Total Outstanding / Net Receivable deltas are
  // the cards' error if they never enrich.
  const coreKpi = summarizeAccountFacets(
    compared.map((r) => ({
      outstanding: r.core,
      unusedAdvance: r.unusedAdvance,
      netPosition: r.core,
    })),
  );

  const needRecon = compared.filter((r) => {
    if (reconAll) return true;
    if (Math.abs(r.d_party_core) > EPS) return true;
    if (r.d_party_snap != null && Math.abs(r.d_party_snap) > EPS) return true;
    return false;
  });

  const reconLimit = Number(process.env.RECON_CONCURRENCY || 4);
  await poolMap(needRecon, reconLimit, async (row) => {
    try {
      const txns = await fetchCustomerLedgerTransactionsWithClient(
        supabase,
        orgId,
        row.customer_id,
        undefined,
        openingById.get(row.customer_id) || 0,
      );
      row.recon = ledgerReconOutstanding(txns);
      row.d_core_recon = (row.core ?? 0) - row.recon;
    } catch (e) {
      row.shape = `recon_error:${e instanceof Error ? e.message : String(e)}`;
    }
    return row;
  });

  for (const r of compared) {
    r.shape = r.shape.startsWith("recon_error")
      ? r.shape
      : classifyShape(r);
  }

  const pairFlags = compared.filter(
    (r) =>
      Math.abs(r.d_party_core) > EPS ||
      (r.d_party_snap != null && Math.abs(r.d_party_snap) > EPS) ||
      (r.d_core_recon != null && Math.abs(r.d_core_recon) > EPS),
  );

  const sumAbs = (pick: (r: Row) => number) =>
    pairFlags.reduce((s, r) => s + Math.abs(pick(r)), 0);

  return {
    orgId,
    elapsedMs: Date.now() - started,
    partyRows: partyRows.length,
    snapshotRows: snapshotRows.length,
    snapshotError,
    customers: customers.length,
    reconAttempted: needRecon.length,
    flagged: pairFlags.length,
    absPartyVsCore: sumAbs((r) => r.d_party_core),
    absPartyVsSnap: sumAbs((r) => r.d_party_snap || 0),
    absCoreVsRecon: sumAbs((r) => r.d_core_recon || 0),
    partyKpi,
    coreKpi,
    kpiDelta: {
      totalOutstandingDr: partyKpi.totalOutstandingDr - coreKpi.totalOutstandingDr,
      totalCreditPoolCr: partyKpi.totalCreditPoolCr - coreKpi.totalCreditPoolCr,
      netReceivable: partyKpi.netReceivable - coreKpi.netReceivable,
    },
    byShape: pairFlags.reduce<Record<string, number>>((acc, r) => {
      acc[r.shape] = (acc[r.shape] || 0) + 1;
      return acc;
    }, {}),
    samples: pairFlags
      .slice()
      .sort((a, b) => Math.abs(b.d_party_core) - Math.abs(a.d_party_core))
      .slice(0, 15),
    flaggedRows: pairFlags,
  };
}

async function main() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY;
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const orgIds = orgIdsFromEnv();
  if (!url || !key || !token || orgIds.length === 0) {
    console.error(
      JSON.stringify(
        {
          status: "blocked",
          reason: "missing_jwt",
          need: [
            "VITE_SUPABASE_URL",
            "VITE_SUPABASE_PUBLISHABLE_KEY",
            "SUPABASE_ACCESS_TOKEN (EzzyERP session JWT)",
            "ORG_ID (ELLA NOOR 3fdca631-1e0c-4417-9704-421f5129ff67) or ORG_IDS",
          ],
          defaultOrgIfUnset: ELLA_NOOR,
          anonProbe:
            "get_customer_party_balances with publishable key returns 42501 (REVOKE FROM anon)",
        },
        null,
        2,
      ),
    );
    process.exit(2);
  }

  const supabase = createClient(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const reconAll = process.argv.includes("--recon-all");
  const results = [];
  for (const orgId of orgIds) {
    console.error(`Measuring ${orgId} …`);
    results.push(await measureOrg(supabase, orgId, reconAll));
  }

  const outDir = "/opt/cursor/artifacts";
  try {
    mkdirSync(outDir, { recursive: true });
  } catch {
    /* ignore */
  }
  const payload = { generatedAt: new Date().toISOString(), reconAll, results };
  const json = JSON.stringify(payload, null, 2);
  writeFileSync(resolve(outDir, "phase0-customer-balance-triple-drift.json"), json);
  writeFileSync(resolve(process.cwd(), "scripts/phase0-customer-balance-triple-drift.last.json"), json);
  console.log(json);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
