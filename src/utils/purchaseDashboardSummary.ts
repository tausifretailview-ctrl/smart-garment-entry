import { supabase } from "@/integrations/supabase/client";
import { derivePurchaseBillDisplayStatus } from "@/utils/purchaseBillSettlement";
import {
  fetchPurchaseBillIdsMatchingLineItems,
  purchaseBillTextSearchFilter,
} from "@/utils/purchaseBillDashboardSearch";

export type PurchaseDashboardSummary = {
  total_count: number;
  total_amount: number;
  paid_amount: number;
  unpaid_amount: number;
  partial_amount: number;
};

type FetchPurchaseSummaryParams = {
  organizationId: string;
  startDate: string;
  endDate: string;
  paymentStatusFilter: string;
  dcFilter: string;
  debouncedSearch: string;
};

type PurchaseSummaryBillRow = {
  net_amount?: number;
  paid_amount?: number;
  payment_status?: string | null;
};

const PURCHASE_BILL_STATS_RPC_CACHE_KEY = "ezzy:rpc:get_purchase_bill_dashboard_stats";

let purchaseBillStatsRpcWarned = false;

function isPurchaseBillStatsRpcUnavailable(): boolean {
  try {
    return sessionStorage.getItem(PURCHASE_BILL_STATS_RPC_CACHE_KEY) === "0";
  } catch {
    return false;
  }
}

function markPurchaseBillStatsRpcUnavailable(): void {
  try {
    sessionStorage.setItem(PURCHASE_BILL_STATS_RPC_CACHE_KEY, "0");
  } catch {
    // ignore storage failures
  }
}

export function isPurchaseBillStatsRpcNotFoundError(
  error: { code?: string; message?: string; status?: number; hint?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.status === 404) return true;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const msg = String(error.message || error.hint || "");
  return /get_purchase_bill_dashboard_stats/i.test(msg);
}

function warnPurchaseBillStatsRpcFallback(reason: string): void {
  if (purchaseBillStatsRpcWarned) return;
  purchaseBillStatsRpcWarned = true;
  console.warn(
    `[PurchaseDashboard] get_purchase_bill_dashboard_stats unavailable (${reason}) — using client summary scan. ` +
      "Apply migration supabase/migrations/20260607200000_get_purchase_bill_dashboard_stats.sql to remove this fallback.",
  );
}

function applyPurchaseBillFilters(
  query: any,
  params: Omit<FetchPurchaseSummaryParams, "debouncedSearch">,
) {
  let q = query
    .eq("organization_id", params.organizationId)
    .is("deleted_at", null);

  if (params.startDate) q = q.gte("bill_date", params.startDate);
  if (params.endDate) q = q.lte("bill_date", params.endDate);

  if (params.paymentStatusFilter === "all" || !params.paymentStatusFilter) {
    q = q.or("is_cancelled.is.null,is_cancelled.eq.false");
  } else if (params.paymentStatusFilter === "cancelled") {
    q = q.eq("is_cancelled", true);
  } else if (params.paymentStatusFilter === "all_including_cancelled") {
    // no cancelled filter
  } else if (params.paymentStatusFilter === "not_paid") {
    q = q
      .or("is_cancelled.is.null,is_cancelled.eq.false")
      .or("payment_status.is.null,payment_status.eq.unpaid,payment_status.eq.pending");
  } else {
    q = q
      .or("is_cancelled.is.null,is_cancelled.eq.false")
      .eq("payment_status", params.paymentStatusFilter);
  }

  if (params.dcFilter === "dc") {
    q = q.eq("is_dc_purchase", true);
  } else if (params.dcFilter === "gst") {
    q = q.or("is_dc_purchase.is.null,is_dc_purchase.eq.false");
  }

  return q;
}

function aggregatePurchaseSummaryRows(allBills: PurchaseSummaryBillRow[]): PurchaseDashboardSummary {
  let paid_amount = 0;
  let partial_amount = 0;
  let unpaid_amount = 0;
  for (const b of allBills) {
    const net = Number(b.net_amount || 0);
    const st = derivePurchaseBillDisplayStatus(b);
    if (st === "paid") paid_amount += net;
    else if (st === "partial") partial_amount += net;
    else unpaid_amount += net;
  }

  return {
    total_count: allBills.length,
    total_amount: allBills.reduce((s, b) => s + (b.net_amount || 0), 0),
    paid_amount,
    unpaid_amount,
    partial_amount,
  };
}

async function paginatePurchaseSummaryRows(query: any): Promise<PurchaseSummaryBillRow[]> {
  const allBills: PurchaseSummaryBillRow[] = [];
  let from = 0;
  const batchSize = 1000;
  let hasMore = true;
  while (hasMore) {
    const { data, error } = await query.range(from, from + batchSize - 1);
    if (error) throw error;
    if (data && data.length > 0) {
      allBills.push(...data);
      from += batchSize;
      hasMore = data.length === batchSize;
    } else {
      hasMore = false;
    }
  }
  return allBills;
}

/** Client aggregation when the stats RPC is missing or filters include search. */
async function fetchPurchaseSummaryClient(
  params: Omit<FetchPurchaseSummaryParams, "debouncedSearch">,
): Promise<PurchaseDashboardSummary> {
  const query = applyPurchaseBillFilters(
    supabase.from("purchase_bills").select("net_amount, paid_amount, payment_status, total_qty"),
    params,
  );
  const allBills = await paginatePurchaseSummaryRows(query);
  return aggregatePurchaseSummaryRows(allBills);
}

/** Client fallback when search is active — paginates lightweight bill rows. */
async function fetchPurchaseSummaryWithSearch(
  params: FetchPurchaseSummaryParams,
): Promise<PurchaseDashboardSummary> {
  const searchStr = params.debouncedSearch.trim();
  let query = applyPurchaseBillFilters(
    supabase.from("purchase_bills").select("net_amount, paid_amount, payment_status, total_qty"),
    params,
  );

  const matchingBillIds = await fetchPurchaseBillIdsMatchingLineItems(
    params.organizationId,
    searchStr,
    { startDate: params.startDate, endDate: params.endDate },
  );
  const billTextFilter = purchaseBillTextSearchFilter(searchStr);

  if (matchingBillIds.length > 0) {
    const { data: textMatches } = await supabase
      .from("purchase_bills")
      .select("id")
      .eq("organization_id", params.organizationId)
      .is("deleted_at", null)
      .or(billTextFilter);
    const allMatchIds = [
      ...new Set([...(textMatches || []).map((b: { id: string }) => b.id), ...matchingBillIds]),
    ];
    query = query.in("id", allMatchIds);
  } else {
    query = query.or(billTextFilter);
  }

  const allBills = await paginatePurchaseSummaryRows(query);
  return aggregatePurchaseSummaryRows(allBills);
}

async function fetchPurchaseSummaryViaRpc(
  params: Omit<FetchPurchaseSummaryParams, "debouncedSearch">,
): Promise<PurchaseDashboardSummary> {
  const { data, error } = await (supabase as any).rpc("get_purchase_bill_dashboard_stats", {
    p_org_id: params.organizationId,
    p_start_date: params.startDate || null,
    p_end_date: params.endDate || null,
    p_payment_status_filter: params.paymentStatusFilter || "all",
    p_dc_filter: params.dcFilter || "all",
  });

  if (error) {
    if (isPurchaseBillStatsRpcNotFoundError(error)) {
      markPurchaseBillStatsRpcUnavailable();
      warnPurchaseBillStatsRpcFallback(error.code || String(error.status ?? "404"));
    } else {
      console.warn(
        "get_purchase_bill_dashboard_stats RPC failed, using client fallback:",
        error.message || error,
      );
    }
    return fetchPurchaseSummaryClient(params);
  }

  const row = (data || {}) as Record<string, unknown>;
  return {
    total_count: Number(row.total_count ?? 0),
    total_amount: Number(row.total_amount ?? 0),
    paid_amount: Number(row.paid_amount ?? 0),
    unpaid_amount: Number(row.unpaid_amount ?? 0),
    partial_amount: Number(row.partial_amount ?? 0),
  };
}

export async function fetchPurchaseDashboardSummary(
  params: FetchPurchaseSummaryParams,
): Promise<PurchaseDashboardSummary> {
  if (params.debouncedSearch.trim()) {
    return fetchPurchaseSummaryWithSearch(params);
  }

  if (isPurchaseBillStatsRpcUnavailable()) {
    return fetchPurchaseSummaryClient(params);
  }

  try {
    return await fetchPurchaseSummaryViaRpc(params);
  } catch (err) {
    if (isPurchaseBillStatsRpcNotFoundError(err as { status?: number; code?: string; message?: string })) {
      markPurchaseBillStatsRpcUnavailable();
      warnPurchaseBillStatsRpcFallback("network");
    } else {
      console.warn("get_purchase_bill_dashboard_stats RPC threw, using client fallback:", err);
    }
    return fetchPurchaseSummaryClient(params);
  }
}
