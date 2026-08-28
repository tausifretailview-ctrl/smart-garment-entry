import { useQuery } from "@tanstack/react-query";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { DASHBOARD_MANUAL_REFRESH_OPTIONS } from "@/lib/dashboardQueryOptions";
import {
  CUSTOMER_PARTY_BALANCE_ORG_WINDOW_QUERY_KEY,
  fetchCustomerPartyBalanceOrgWindow,
  type CustomerPartyBalanceOrgWindow,
} from "@/utils/customerPartyBalanceSnapshot";

const EMPTY: CustomerPartyBalanceOrgWindow = { netReceivable: 0 };

export function useCustomerPartyBalanceOrgWindow(
  organizationId: string | null | undefined,
  options?: { manualRefreshOnly?: boolean; enabled?: boolean; staleTime?: number },
) {
  const queryEnabled =
    options?.enabled !== undefined ? options.enabled : !!organizationId;
  const staleTime = options?.staleTime ?? STALE_FREQUENT;
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [CUSTOMER_PARTY_BALANCE_ORG_WINDOW_QUERY_KEY, organizationId],
    queryFn: () => fetchCustomerPartyBalanceOrgWindow(organizationId!),
    enabled: queryEnabled && !!organizationId,
    ...(options?.manualRefreshOnly
      ? DASHBOARD_MANUAL_REFRESH_OPTIONS
      : { staleTime, refetchOnWindowFocus: false }),
  });

  return {
    window: data ?? EMPTY,
    isLoading,
    isFetching,
    error,
    refetch,
  };
}
