import { useQuery } from "@tanstack/react-query";
import {
  CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY,
  fetchOrganizationCustomerAccountTotals,
  type OrganizationCustomerAccountTotals,
} from "@/utils/customerFinancialSnapshot";

const EMPTY: OrganizationCustomerAccountTotals = {
  customerCount: 0,
  customersWithOutstanding: 0,
  customersWithAdvance: 0,
  customersWithCn: 0,
  totalOutstandingDr: 0,
  totalAdvanceAvailable: 0,
  totalCnAvailable: 0,
  totalCnPendingCount: 0,
};

export function useOrganizationCustomerAccountTotals(organizationId: string | null | undefined) {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY, "org-totals", organizationId],
    queryFn: () => fetchOrganizationCustomerAccountTotals(organizationId!),
    enabled: !!organizationId,
    staleTime: 300_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });

  return {
    totals: data ?? EMPTY,
    isLoading,
    isFetching,
    error,
    refetch,
  };
}
