import { supabase } from "@/integrations/supabase/client";
import type { PurchaseDashboardSummary } from "@/utils/purchaseDashboardSummary";
import { fetchPurchaseDashboardSummary } from "@/utils/purchaseDashboardSummary";
import {
  fetchPurchaseBillIdsMatchingLineItems,
  purchaseBillTextSearchFilter,
} from "@/utils/purchaseBillDashboardSearch";

export type PurchaseBillDashboardRow = {
  id: string;
  supplier_id?: string | null;
  supplier_name?: string | null;
  supplier_invoice_no?: string | null;
  software_bill_no?: string | null;
  bill_date?: string | null;
  bill_entry_at?: string | null;
  gross_amount?: number | null;
  discount_amount?: number | null;
  gst_amount?: number | null;
  net_amount?: number | null;
  notes?: string | null;
  created_at?: string | null;
  created_by?: string | null;
  payment_status?: string | null;
  paid_amount?: number | null;
  total_qty?: number | null;
  total_items?: number | null;
  is_dc_purchase?: boolean | null;
  bill_image_url?: string | null;
  is_locked?: boolean | null;
  is_cancelled?: boolean | null;
  cancelled_at?: string | null;
  cancelled_reason?: string | null;
  purchase_return_adjust?: number | null;
  pr_adjust_date?: string | null;
};

export type PurchaseBillsDashboardPageResult = {
  bills: PurchaseBillDashboardRow[];
  totalCount: number;
  summary: PurchaseDashboardSummary;
};

export type FetchPurchaseBillsDashboardPageParams = {
  organizationId: string;
  startDate: string;
  endDate: string;
  paymentStatusFilter: string;
  dcFilter: string;
  debouncedSearch: string;
  sortOrder: "asc" | "desc";
  page: number;
  pageSize: number;
  signal?: AbortSignal;
};

const PURCHASE_BILLS_PAGE_RPC_KEY = "ezzy:rpc:get_purchase_bills_dashboard_page";

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

function withAbortSignal<T extends { abortSignal: (signal: AbortSignal) => T }>(
  query: T,
  signal?: AbortSignal,
): T {
  return signal ? query.abortSignal(signal) : query;
}

export function isPurchaseBillsPageRpcNotFoundError(
  error: { code?: string; message?: string; status?: number; hint?: string } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.status === 404) return true;
  if (error.code === "PGRST202" || error.code === "42883") return true;
  const msg = String(error.message || error.hint || "");
  return /get_purchase_bills_dashboard_page/i.test(msg);
}

function isPurchaseBillsPageRpcUnavailable(): boolean {
  try {
    return sessionStorage.getItem(PURCHASE_BILLS_PAGE_RPC_KEY) === "0";
  } catch {
    return false;
  }
}

function markPurchaseBillsPageRpcUnavailable(): void {
  try {
    sessionStorage.setItem(PURCHASE_BILLS_PAGE_RPC_KEY, "0");
  } catch {
    // ignore
  }
}

function parseSummary(raw: Record<string, unknown> | null | undefined): PurchaseDashboardSummary {
  return {
    total_count: Number(raw?.total_count ?? 0),
    total_amount: Number(raw?.total_amount ?? 0),
    paid_amount: Number(raw?.paid_amount ?? 0),
    unpaid_amount: Number(raw?.unpaid_amount ?? 0),
    partial_amount: Number(raw?.partial_amount ?? 0),
  };
}

/** Client fallback — mirrors PurchaseBillDashboard list query (uses total_items column). */
async function fetchPurchaseBillsDashboardPageClient(
  params: FetchPurchaseBillsDashboardPageParams,
): Promise<PurchaseBillsDashboardPageResult> {
  const { organizationId, signal } = params;
  throwIfAborted(signal);

  const startIndex = (params.page - 1) * params.pageSize;
  const endIndex = startIndex + params.pageSize - 1;

  let query = supabase
    .from("purchase_bills")
    .select(
      "id, supplier_id, supplier_name, supplier_invoice_no, software_bill_no, bill_date, bill_entry_at, gross_amount, discount_amount, gst_amount, net_amount, notes, created_at, created_by, payment_status, paid_amount, total_qty, total_items, is_dc_purchase, bill_image_url, is_locked, is_cancelled, cancelled_at, cancelled_reason",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  const isBarcodeLikeSearch =
    params.debouncedSearch && /^\d{4,}$/.test(params.debouncedSearch.trim());

  if (params.debouncedSearch) {
    const searchStr = params.debouncedSearch.trim();
    const matchingBillIds = await fetchPurchaseBillIdsMatchingLineItems(
      organizationId,
      searchStr,
      {
        startDate: isBarcodeLikeSearch ? undefined : params.startDate,
        endDate: isBarcodeLikeSearch ? undefined : params.endDate,
        skipDate: Boolean(isBarcodeLikeSearch),
      },
    );
    const billTextFilter = purchaseBillTextSearchFilter(searchStr);

    if (matchingBillIds.length > 0) {
      const { data: textMatches, error } = await withAbortSignal(
        supabase
          .from("purchase_bills")
          .select("id")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .or(billTextFilter),
        signal,
      );
      if (error) throw error;
      const allMatchIds = [
        ...new Set([...(textMatches || []).map((b: { id: string }) => b.id), ...matchingBillIds]),
      ];
      query = query.in("id", allMatchIds);
    } else {
      query = query.or(billTextFilter);
    }
  }

  if (params.startDate && !isBarcodeLikeSearch) {
    query = query.gte("bill_date", params.startDate);
  }
  if (params.endDate && !isBarcodeLikeSearch) {
    query = query.lte("bill_date", params.endDate);
  }

  if (params.paymentStatusFilter === "all" || !params.paymentStatusFilter) {
    query = query.or("is_cancelled.is.null,is_cancelled.eq.false");
  } else if (params.paymentStatusFilter === "cancelled") {
    query = query.eq("is_cancelled", true);
  } else if (params.paymentStatusFilter === "all_including_cancelled") {
    // no filter
  } else if (params.paymentStatusFilter === "not_paid") {
    query = query
      .or("is_cancelled.is.null,is_cancelled.eq.false")
      .or("payment_status.is.null,payment_status.eq.unpaid,payment_status.eq.pending");
  } else {
    query = query
      .or("is_cancelled.is.null,is_cancelled.eq.false")
      .eq("payment_status", params.paymentStatusFilter);
  }

  if (params.dcFilter === "dc") {
    query = query.eq("is_dc_purchase", true);
  } else if (params.dcFilter === "gst") {
    query = query.or("is_dc_purchase.is.null,is_dc_purchase.eq.false");
  }

  query = query
    .order("bill_date", { ascending: params.sortOrder === "asc" })
    .range(startIndex, endIndex);

  const { data, error, count } = await withAbortSignal(query, signal);
  if (error) throw error;

  const bills = (data || []) as PurchaseBillDashboardRow[];
  const summary = await fetchPurchaseDashboardSummary({
    organizationId,
    startDate: params.startDate,
    endDate: params.endDate,
    paymentStatusFilter: params.paymentStatusFilter,
    dcFilter: params.dcFilter,
    debouncedSearch: params.debouncedSearch,
  });

  return {
    bills,
    totalCount: count || 0,
    summary,
  };
}

async function fetchPurchaseBillsDashboardPageViaRpc(
  params: FetchPurchaseBillsDashboardPageParams,
): Promise<PurchaseBillsDashboardPageResult> {
  throwIfAborted(params.signal);

  const { data, error } = await withAbortSignal(
    (supabase as any).rpc("get_purchase_bills_dashboard_page", {
      p_org_id: params.organizationId,
      p_start_date: params.startDate || null,
      p_end_date: params.endDate || null,
      p_payment_status_filter: params.paymentStatusFilter || "all",
      p_dc_filter: params.dcFilter || "all",
      p_search: params.debouncedSearch.trim() || null,
      p_sort_asc: params.sortOrder === "asc",
      p_offset: (params.page - 1) * params.pageSize,
      p_limit: params.pageSize,
    }),
    params.signal,
  );

  if (error) {
    if (isPurchaseBillsPageRpcNotFoundError(error)) {
      markPurchaseBillsPageRpcUnavailable();
    }
    throw error;
  }

  const row = (data || {}) as {
    bills?: PurchaseBillDashboardRow[];
    total_count?: number;
    summary?: Record<string, unknown>;
  };

  return {
    bills: row.bills || [],
    totalCount: Number(row.total_count ?? 0),
    summary: parseSummary(row.summary),
  };
}

export async function fetchPurchaseBillsDashboardPage(
  params: FetchPurchaseBillsDashboardPageParams,
): Promise<PurchaseBillsDashboardPageResult> {
  if (!params.organizationId) {
    return {
      bills: [],
      totalCount: 0,
      summary: {
        total_count: 0,
        total_amount: 0,
        paid_amount: 0,
        unpaid_amount: 0,
        partial_amount: 0,
      },
    };
  }

  if (isPurchaseBillsPageRpcUnavailable()) {
    return fetchPurchaseBillsDashboardPageClient(params);
  }

  try {
    return await fetchPurchaseBillsDashboardPageViaRpc(params);
  } catch (err) {
    if (isPurchaseBillsPageRpcNotFoundError(err as { code?: string; message?: string })) {
      return fetchPurchaseBillsDashboardPageClient(params);
    }
    throw err;
  }
}
