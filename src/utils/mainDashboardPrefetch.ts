import type { QueryClient } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { DASHBOARD_MANUAL_REFRESH_OPTIONS, DASHBOARD_TAB_RETURN_QUERY_OPTIONS } from "@/lib/dashboardQueryOptions";
import { fetchTotalCustomerCount } from "@/utils/salePartyCustomerMaster";

/** Default monthly range — matches Index.tsx initial dateRange. */
export function mainDashboardDefaultStatsQueryKey(organizationId: string) {
  const now = new Date();
  const startDate = format(startOfMonth(now), "yyyy-MM-dd");
  const endDate = format(endOfMonth(now), "yyyy-MM-dd");
  return ["dashboard-stats", organizationId, startDate, endDate] as const;
}

/** Warm main dashboard RPC after login so first visit is not empty/waiting. */
export function prefetchMainDashboardQueries(
  queryClient: QueryClient,
  organizationId: string,
): void {
  const queryKey = mainDashboardDefaultStatsQueryKey(organizationId);
  const [, , startDate, endDate] = queryKey;

  void queryClient.prefetchQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_erp_dashboard_stats", {
        p_org_id: organizationId,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      return data;
    },
    staleTime: 30_000,
    ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  });

  void queryClient.prefetchQuery({
    queryKey: ["dashboard-customer-total", organizationId],
    queryFn: () => fetchTotalCustomerCount(organizationId),
    ...DASHBOARD_MANUAL_REFRESH_OPTIONS,
  });
}
