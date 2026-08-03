import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DASHBOARD_TAB_RETURN_QUERY_OPTIONS } from "@/lib/dashboardQueryOptions";
import { fetchPurchaseBillsDashboardPage } from "@/utils/purchaseBillDashboardPage";
import { resolvePurchaseDashboardQueryDates } from "@/utils/purchaseDashboardDates";

/** Must match PurchaseBillDashboard default `itemsPerPage` (100) or login warm-up never hits. */
const DEFAULT_PAGE_SIZE = 100;

export function purchaseBillsDefaultQueryKey(organizationId: string) {
  // Matches first paint: monthly period, page 1, pageSize 100, no search.
  const { startDate, endDate } = resolvePurchaseDashboardQueryDates("monthly", "", "");
  return [
    "purchase-bills",
    organizationId,
    "",
    "monthly",
    startDate,
    endDate,
    "desc",
    1,
    DEFAULT_PAGE_SIZE,
    "all",
    "all",
  ] as const;
}

/** Warm purchase dashboard list + summary after login (mirrors sales invoice prefetch). */
export function prefetchPurchaseDashboardQueries(
  queryClient: QueryClient,
  _supabase: SupabaseClient,
  organizationId: string,
): void {
  const { startDate, endDate } = resolvePurchaseDashboardQueryDates("monthly", "", "");
  void queryClient.prefetchQuery({
    queryKey: purchaseBillsDefaultQueryKey(organizationId),
    queryFn: () =>
      fetchPurchaseBillsDashboardPage({
        organizationId,
        startDate,
        endDate,
        paymentStatusFilter: "all",
        dcFilter: "all",
        debouncedSearch: "",
        sortOrder: "desc",
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
      }),
    staleTime: 30_000,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });
}
