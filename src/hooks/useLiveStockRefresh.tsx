import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  catchUpLiveStock,
  onStockMarkerEvent,
  requestLiveStockRefresh,
  setLocalStockWriteHandler,
} from "@/lib/liveStockRefresh";

/**
 * Stock screens follow stock changed in other browser tabs on this computer (see
 * liveStockRefresh.ts). Changes from other computers arrive through the sales live updates in
 * useOrgMoneyRealtimeInvalidation. Mount once per layout, beside OrgMoneyRealtimeInvalidation.
 */
function useLiveStockRefresh() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;

  useEffect(() => {
    if (!orgId) return;
    // This tab changed stock: its own stock screens follow too (sale return, purchase return and
    // stock adjustment screens did not refresh them before).
    const release = setLocalStockWriteHandler(orgId, () => requestLiveStockRefresh(queryClient, orgId));
    const onStorage = (event: StorageEvent) => onStockMarkerEvent(queryClient, orgId, event);
    const onVisible = () => {
      if (document.visibilityState === "visible") catchUpLiveStock(queryClient, orgId);
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);
    return () => {
      release();
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
    };
  }, [orgId, queryClient]);
}

export function LiveStockRefresh() {
  useLiveStockRefresh();
  return null;
}
