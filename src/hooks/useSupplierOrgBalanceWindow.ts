import { useQuery } from "@tanstack/react-query";
import { STALE_FREQUENT } from "@/lib/queryStaleTimes";
import { DASHBOARD_MANUAL_REFRESH_OPTIONS } from "@/lib/dashboardQueryOptions";
import {
  SUPPLIER_ORG_BALANCE_WINDOW_QUERY_KEY,
  fetchSupplierOrgBalanceWindow,
} from "@/utils/supplierPartyBalanceSnapshot";
import type { SupplierOrgBalanceWindow } from "@/utils/supplierBalanceUtils";

const EMPTY: SupplierOrgBalanceWindow = {
  totalPayableCr: 0,
  totalAdvanceDr: 0,
  netPayable: 0,
  activeSupplierCount: 0,
  payableSupplierCount: 0,
};

export function useSupplierOrgBalanceWindow(
  organizationId: string | null | undefined,
  options?: { manualRefreshOnly?: boolean; enabled?: boolean; staleTime?: number },
) {
  const queryEnabled =
    options?.enabled !== undefined ? options.enabled : !!organizationId;
  const staleTime = options?.staleTime ?? STALE_FREQUENT;
  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [SUPPLIER_ORG_BALANCE_WINDOW_QUERY_KEY, organizationId],
    queryFn: () => fetchSupplierOrgBalanceWindow(organizationId!),
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
