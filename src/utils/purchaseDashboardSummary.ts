import { supabase } from "@/integrations/supabase/client";
import { derivePurchaseBillDisplayStatus } from "@/utils/purchaseBillSettlement";

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

/** Client fallback when search is active — paginates lightweight bill rows. */
async function fetchPurchaseSummaryWithSearch(
  params: FetchPurchaseSummaryParams,
): Promise<PurchaseDashboardSummary> {
  const searchStr = params.debouncedSearch.trim();
  let query = applyPurchaseBillFilters(
    supabase.from("purchase_bills").select("net_amount, paid_amount, payment_status, total_qty"),
    params,
  );

  const { data: matchingItems } = await (supabase as any)
    .from("purchase_items")
    .select("bill_id")
    .is("deleted_at", null)
    .or(
      `product_name.ilike.%${searchStr}%,brand.ilike.%${searchStr}%,barcode.ilike.%${searchStr}%,style.ilike.%${searchStr}%,category.ilike.%${searchStr}%,color.ilike.%${searchStr}%`,
    )
    .limit(300);

  const matchingBillIds = [
    ...new Set((matchingItems || []).map((i: { bill_id: string }) => i.bill_id).filter(Boolean)),
  ] as string[];
  const billTextFilter = `supplier_name.ilike.%${searchStr}%,supplier_invoice_no.ilike.%${searchStr}%,software_bill_no.ilike.%${searchStr}%`;

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

  const allBills: Array<{ net_amount?: number; paid_amount?: number; payment_status?: string | null }> = [];
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

export async function fetchPurchaseDashboardSummary(
  params: FetchPurchaseSummaryParams,
): Promise<PurchaseDashboardSummary> {
  if (params.debouncedSearch.trim()) {
    return fetchPurchaseSummaryWithSearch(params);
  }

  const { data, error } = await (supabase as any).rpc("get_purchase_bill_dashboard_stats", {
    p_org_id: params.organizationId,
    p_start_date: params.startDate || null,
    p_end_date: params.endDate || null,
    p_payment_status_filter: params.paymentStatusFilter || "all",
    p_dc_filter: params.dcFilter || "all",
  });

  if (error) {
    // RPC may not exist until migration is applied — fall back to client scan without search.
    return fetchPurchaseSummaryWithSearch({ ...params, debouncedSearch: "" });
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
