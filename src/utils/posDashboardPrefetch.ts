import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { format } from "date-fns";
import { DASHBOARD_TAB_RETURN_QUERY_OPTIONS } from "@/lib/dashboardQueryOptions";
import {
  fetchPosDashboardPage,
  fetchPosDashboardSummary,
  resolvePosDashboardQueryDates,
  type PosDashboardFilters,
} from "@/utils/posDashboardSales";

const DEFAULT_PAGE_SIZE = 50;

export function buildDefaultPosDashboardFilters(organizationId: string): PosDashboardFilters {
  const today = format(new Date(), "yyyy-MM-dd");
  const { startDate, endDate } = resolvePosDashboardQueryDates("daily", today, today);
  return {
    organizationId,
    search: "",
    startDate,
    endDate,
    paymentMethodFilter: "all",
    paymentStatusFilter: [],
    saleTypeFilter: "all",
    refundFilter: "all",
    creditNoteFilter: "all",
    userFilter: "all",
    cancelFilter: "active",
  };
}

/** Matches POSDashboard default query key (daily / today / page 1). */
export function posDashboardDefaultQueryKey(organizationId: string) {
  const today = format(new Date(), "yyyy-MM-dd");
  const { startDate, endDate } = resolvePosDashboardQueryDates("daily", today, today);
  return [
    "pos-dashboard-sales",
    organizationId,
    "",
    "daily",
    startDate,
    endDate,
    "all",
    [] as string[],
    "all",
    "all",
    "all",
    "all",
    "active",
    1,
    DEFAULT_PAGE_SIZE,
  ] as const;
}

/** Warm POS dashboard list + summary after login (mirrors sales/purchase prefetch). */
export function prefetchPosDashboardQueries(
  queryClient: QueryClient,
  client: SupabaseClient,
  organizationId: string,
): void {
  const filters = buildDefaultPosDashboardFilters(organizationId);
  const queryKey = posDashboardDefaultQueryKey(organizationId);

  void queryClient.prefetchQuery({
    queryKey,
    queryFn: () =>
      fetchPosDashboardPage(client, filters, {
        page: 1,
        pageSize: DEFAULT_PAGE_SIZE,
      }),
    staleTime: 30_000,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });

  void queryClient.prefetchQuery({
    queryKey: [...queryKey, "summary"],
    queryFn: () => fetchPosDashboardSummary(client, filters),
    staleTime: 30_000,
    retry: false,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });
}
