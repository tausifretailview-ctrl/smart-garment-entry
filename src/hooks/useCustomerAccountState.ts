import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchCustomerAccountStateView,
  type CustomerAccountStateView,
} from "@/utils/customerAccountStateView";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";

export const CUSTOMER_ACCOUNT_STATE_QUERY_KEY = "customer-account-state-view";

const EMPTY: CustomerAccountStateView = {
  customerId: "",
  customerName: "",
  outstanding: 0,
  unusedAdvance: 0,
  unclaimedSaleReturn: 0,
  netPosition: 0,
  openingBalance: 0,
  advanceLegs: [],
};

export function useCustomerAccountState(
  customerId: string | null | undefined,
  organizationId: string | null | undefined,
) {
  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: [CUSTOMER_ACCOUNT_STATE_QUERY_KEY, organizationId, customerId],
    queryFn: () =>
      fetchCustomerAccountStateView(supabase, organizationId!, customerId!),
    enabled: Boolean(customerId && organizationId),
    staleTime: STALE_FREQUENT,
    refetchOnWindowFocus: false,
  });

  return {
    state: data ?? EMPTY,
    isLoading,
    isFetching,
    refetch,
    error,
  };
}
