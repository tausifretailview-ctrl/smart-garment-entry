import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import { useOrganization } from "@/contexts/OrganizationContext";
import { fetchAllOpenSettlementVariantIds } from "@/utils/stockSettlementScans";

const queryKey = (orgId: string | undefined) => ["open-settlement-variant-ids", orgId] as const;

/**
 * PersistQueryClient JSON-encodes query data. `Set` becomes `{}`, so calling
 * `.has` after restore throws ("… is not a function") and POS barcode add
 * surfaces as "Lookup failed". Always persist/return a plain string[].
 */
export function toLockedVariantIdSet(data: unknown): Set<string> {
  if (data instanceof Set) {
    return data as Set<string>;
  }
  if (Array.isArray(data)) {
    return new Set(data.filter((id): id is string => typeof id === "string" && id.length > 0));
  }
  return new Set<string>();
}

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
    queryFn: async (): Promise<string[]> => {
      if (!orgId) return [];
      try {
        const ids = await fetchAllOpenSettlementVariantIds(orgId);
        return [...ids];
      } catch (err) {
        console.error("useOpenSettlementVariantIds:", err);
        return [];
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

  const lockedVariantIds = useMemo(() => toLockedVariantIdSet(data), [data]);

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
  title: "Product locked — stock settlement in progress",
  description:
    "This product is currently scanned into an open stock settlement session. Settle or remove it from the settlement session before selling.",
} as const;

export const SETTLEMENT_LOCK_TOAST_DURATION_MS = 8000;

export function settlementLockedAddToast(productName: string, barcode: string) {
  const code = (barcode || "").trim() || "—";
  return {
    title: LOCKED_VARIANT_TOAST.title,
    description: `${productName} (${code}) is currently scanned into an open stock settlement session. Settle or remove it from the settlement session before selling.`,
  };
}

export function getSettlementLockedCartItems<
  T extends { variantId?: string | null; productName?: string; barcode?: string | null },
>(items: T[], lockedVariantIds: Set<string> | unknown): T[] {
  const locked = toLockedVariantIdSet(lockedVariantIds);
  return items.filter((item) => !!item.variantId && locked.has(item.variantId));
}

export function settlementLockedSaveToast(
  items: Array<{ productName?: string; barcode?: string | null }>,
) {
  const list = items
    .map((item) => {
      const name = (item.productName || "Product").trim();
      const code = (item.barcode || "").trim() || "—";
      return `${name} (${code})`;
    })
    .join(", ");
  return {
    title: "Cannot save — stock settlement in progress",
    description: `These products are locked in an open stock settlement session: ${list}. Settle or remove them from settlement before selling.`,
  };
}
