import { useQuery } from "@tanstack/react-query";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { DASHBOARD_MANUAL_REFRESH_OPTIONS } from "@/lib/dashboardQueryOptions";
import {
  ORGANIZATION_RECEIVABLES_QUERY_KEY,
  fetchOrganizationReceivablesSummary,
  type OrganizationReceivablesSummary,
} from "@/utils/organizationReceivables";

const EMPTY: OrganizationReceivablesSummary = {
  customerCount: 0,
  customersOwing: 0,
  customersInCredit: 0,
  grossReceivableDr: 0,
  customerCreditPoolCr: 0,
  netReceivable: 0,
  advanceAvailable: 0,
  totalSales: 0,
};

/**
 * Org-level receivables from the Master Reconciliation RPC — shared single source
 * of truth for the Customer Ledger card, Accounts Mgmt, Main Dashboard, Balance Sheet.
 */
export function useOrganizationReceivablesSummary(
  organizationId: string | null | undefined,
  options?: { manualRefreshOnly?: boolean; enabled?: boolean },
) {
  const queryEnabled =
    options?.enabled !== undefined ? options.enabled : !!organizationId;
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [ORGANIZATION_RECEIVABLES_QUERY_KEY, "summary", organizationId],
    queryFn: () => fetchOrganizationReceivablesSummary(organizationId!),
    enabled: queryEnabled && !!organizationId,
    ...(options?.manualRefreshOnly
      ? DASHBOARD_MANUAL_REFRESH_OPTIONS
      : { staleTime: STALE_FREQUENT, refetchOnWindowFocus: false }),
  });

  return {
    summary: data ? { ...EMPTY, ...data } : EMPTY,
    isLoading,
    isFetching,
    error,
    refetch,
  };
}
