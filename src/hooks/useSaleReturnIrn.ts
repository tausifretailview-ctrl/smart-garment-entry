import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchSaleReturnIrnStates } from "@/utils/saleReturnEInvoice";

/**
 * IRN state of the sale returns on screen (Industrial mode, Phase 2 step 2b).
 * Runs only when enabled (Industrial mode + E-Invoice Settings on); other shops make no extra query.
 */
export function useSaleReturnIrn(organizationId: string | undefined, returnIds: string[], enabled: boolean) {
  const queryClient = useQueryClient();
  const idsKey = returnIds.join(",");
  const { data } = useQuery({
    queryKey: ["sale-return-irn", organizationId, idsKey],
    queryFn: () => fetchSaleReturnIrnStates(organizationId!, returnIds),
    enabled: enabled && !!organizationId && returnIds.length > 0,
    staleTime: 30_000,
  });
  const rows = data?.rows;
  const isLocked = useCallback(
    (id: string | null | undefined) => {
      const r = id ? rows?.get(id) : undefined;
      return !!r?.irn && r.einvoice_status === "generated";
    },
    [rows],
  );
  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["sale-return-irn", organizationId] });
  }, [queryClient, organizationId]);
  return { rows, missingSql: !!data?.missingSql, isLocked, refresh };
}
