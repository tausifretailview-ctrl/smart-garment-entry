import { useQuery } from "@tanstack/react-query";
import {
  fetchEwayBillsForSales,
  fetchSaleEwayBills,
  type EwayBillRow,
  type SaleEwbState,
  type SaleIrnState,
} from "@/utils/ewayBill";

const EMPTY: SaleEwbState = {
  rows: new Map<string, EwayBillRow>(),
  irns: new Map<string, SaleIrnState>(),
  missingSql: false,
};

/**
 * IRN and e-way bill of the sale bills on screen (Industrial mode, Phase 2 step 4).
 * Runs only when enabled; other shops make no extra query.
 */
export function useSaleEwayBills(organizationId: string | undefined, saleIds: string[], enabled: boolean) {
  const idsKey = saleIds.join(",");
  const { data, refetch } = useQuery({
    queryKey: ["sale-eway-bills", organizationId ?? "", idsKey],
    queryFn: () => fetchSaleEwayBills(organizationId!, saleIds),
    enabled: enabled && !!organizationId && saleIds.length > 0,
    staleTime: 60_000,
  });
  return { ...(data ?? EMPTY), refetch };
}

/** E-way bills of sale bills whose IRN the caller already has (E-Invoice Report). */
export function useEwayBillsForSales(organizationId: string | undefined, saleIds: string[], enabled: boolean) {
  const idsKey = saleIds.join(",");
  const { data, refetch } = useQuery({
    queryKey: ["eway-bills-for-sales", organizationId ?? "", idsKey],
    queryFn: () => fetchEwayBillsForSales(organizationId!, saleIds),
    enabled: enabled && !!organizationId && saleIds.length > 0,
    staleTime: 60_000,
  });
  return { rows: data?.rows ?? EMPTY.rows, missingSql: data?.missingSql ?? false, refetch };
}
