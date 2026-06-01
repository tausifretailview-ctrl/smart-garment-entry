import { useQuery } from "@tanstack/react-query";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
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
};

/**
 * Org-level receivables from the Master Reconciliation RPC — shared single source
 * of truth for the Customer Ledger card, Accounts Mgmt, Main Dashboard, Balance Sheet.
 */
export function useOrganizationReceivablesSummary(organizationId: string | null | undefined) {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [ORGANIZATION_RECEIVABLES_QUERY_KEY, "summary", organizationId],
    queryFn: () => fetchOrganizationReceivablesSummary(organizationId!),
    enabled: !!organizationId,
    staleTime: STALE_FREQUENT,
    refetchOnWindowFocus: false,
  });

  return {
    summary: data ?? EMPTY,
    isLoading,
    isFetching,
    error,
    refetch,
  };
}
