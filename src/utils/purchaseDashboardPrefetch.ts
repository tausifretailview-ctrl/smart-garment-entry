import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DASHBOARD_TAB_RETURN_QUERY_OPTIONS } from "@/lib/dashboardQueryOptions";
import { fetchPurchaseDashboardSummary } from "@/utils/purchaseDashboardSummary";

const DEFAULT_PAGE_SIZE = 50;

const PURCHASE_BILLS_LIST_SELECT =
  "id, supplier_id, supplier_name, supplier_invoice_no, software_bill_no, bill_date, bill_entry_at, gross_amount, discount_amount, gst_amount, net_amount, notes, created_at, payment_status, paid_amount, total_qty, total_items, is_dc_purchase, bill_image_url, is_locked, is_cancelled, cancelled_at, cancelled_reason";

export function purchaseBillsDefaultQueryKey(organizationId: string) {
  return [
    "purchase-bills",
    organizationId,
    "",
    "",
    "",
    "desc",
    1,
    DEFAULT_PAGE_SIZE,
    "all",
    "all",
  ] as const;
}

export function purchaseSummaryDefaultQueryKey(organizationId: string) {
  return ["purchase-summary", organizationId, "", "", "all", "all", ""] as const;
}

async function fetchPurchaseBillsDefaultPage(supabase: SupabaseClient, organizationId: string) {
  const { data, error, count } = await supabase
    .from("purchase_bills")
    .select(PURCHASE_BILLS_LIST_SELECT, { count: "exact" })
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .or("is_cancelled.is.null,is_cancelled.eq.false")
    .order("bill_date", { ascending: false })
    .range(0, DEFAULT_PAGE_SIZE - 1);

  if (error) throw error;
  return { bills: data ?? [], totalCount: count ?? 0 };
}

/** Warm purchase dashboard list + summary after login (mirrors sales invoice prefetch). */
export function prefetchPurchaseDashboardQueries(
  queryClient: QueryClient,
  supabase: SupabaseClient,
  organizationId: string,
): void {
  void queryClient.prefetchQuery({
    queryKey: purchaseBillsDefaultQueryKey(organizationId),
    queryFn: () => fetchPurchaseBillsDefaultPage(supabase, organizationId),
    staleTime: 30_000,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });

  void queryClient.prefetchQuery({
    queryKey: purchaseSummaryDefaultQueryKey(organizationId),
    queryFn: () =>
      fetchPurchaseDashboardSummary({
        organizationId,
        startDate: "",
        endDate: "",
        paymentStatusFilter: "all",
        dcFilter: "all",
        debouncedSearch: "",
      }),
    staleTime: 30_000,
    retry: false,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });
}
