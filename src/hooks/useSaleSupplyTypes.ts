import { useQuery } from "@tanstack/react-query";
import { fetchSaleSupplyTypes } from "@/utils/saleEInvoiceRoute";
import type { SaleSupplyType } from "@/utils/industrialMode";

const EMPTY = new Map<string, SaleSupplyType>();

/**
 * Export / SEZ bills among the sale bills on screen (Industrial mode, Phase 2 step 3).
 * Runs only when enabled; other shops make no extra query.
 */
export function useSaleSupplyTypes(organizationId: string | undefined, saleIds: string[], enabled: boolean) {
  const idsKey = saleIds.join(",");
  const { data } = useQuery({
    queryKey: ["sale-supply-types", organizationId, idsKey],
    queryFn: () => fetchSaleSupplyTypes(organizationId!, saleIds),
    enabled: enabled && !!organizationId && saleIds.length > 0,
    staleTime: 60_000,
  });
  return data ?? EMPTY;
}
