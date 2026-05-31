import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
import {
  CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY,
  fetchCustomerFinancialSnapshot,
  type CustomerFinancialSnapshot,
} from "@/utils/customerFinancialSnapshot";

const EMPTY: CustomerFinancialSnapshot = {
  outstandingDr: 0,
  advanceAvailable: 0,
  cnAvailableTotal: 0,
  cnPendingCount: 0,
};

export function useCustomerFinancialSnapshot(
  customerId: string | null | undefined,
  organizationId: string | null | undefined,
) {
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY, organizationId, customerId],
    queryFn: async () => {
      if (!customerId || !organizationId) return EMPTY;
      return fetchCustomerFinancialSnapshot(supabase, organizationId, customerId);
    },
    enabled: !!customerId && !!organizationId,
    staleTime: STALE_FREQUENT,
    refetchOnWindowFocus: false,
  });

  const snap = data ?? EMPTY;

  return {
    snapshot: snap,
    outstandingDr: snap.outstandingDr,
    advanceAvailable: snap.advanceAvailable,
    cnAvailableTotal: snap.cnAvailableTotal,
    cnPendingCount: snap.cnPendingCount,
    isLoading,
    isFetching,
    error,
    refetch,
  };
}
