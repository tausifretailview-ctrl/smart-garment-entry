import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchAllOpenSettlementVariantIds } from "@/utils/stockSettlementScans";

const queryKey = (orgId: string | undefined) => ["open-settlement-variant-ids", orgId] as const;

/**
 * Returns the set of variant IDs that currently have unsettled scans in an
 * open Stock Settlement session for the current organization. Sale surfaces
 * (POS, Sale Entry) use this to block selling reserved products until the
 * session is settled.
 *
 * Fail-open: if the query errors, we return an empty set so business is not
 * blocked by transient network failures.
 */
export function useOpenSettlementVariantIds() {
  const { currentOrganization } = useOrganization();
  const orgId = currentOrganization?.id;
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: queryKey(orgId),
    queryFn: async () => {
      if (!orgId) return new Set<string>();
      try {
        return await fetchAllOpenSettlementVariantIds(orgId);
      } catch (err) {
        console.error("useOpenSettlementVariantIds:", err);
        return new Set<string>();
      }
    },
    enabled: !!orgId,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });

  // Refetch when tab becomes visible so a Settle in another tab clears locks
  useEffect(() => {
    if (!orgId) return;
    const onVis = () => {
      if (!document.hidden) {
        queryClient.invalidateQueries({ queryKey: queryKey(orgId) });
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [orgId, queryClient]);

  const lockedVariantIds = data ?? new Set<string>();

  const isLocked = useCallback(
    (variantId: string | null | undefined): boolean =>
      !!variantId && lockedVariantIds.has(variantId),
    [lockedVariantIds],
  );

  const refresh = useCallback(() => {
    if (orgId) queryClient.invalidateQueries({ queryKey: queryKey(orgId) });
  }, [orgId, queryClient]);

  return { lockedVariantIds, isLocked, refresh };
}

export const LOCKED_VARIANT_TOAST = {
  title: "Product locked",
  description:
    "Currently in Stock Settlement. Settle the open session before selling.",
} as const;