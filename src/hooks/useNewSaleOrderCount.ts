import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { useAuth } from "@/contexts/AuthContext";
import {
  countNewSaleOrders,
  isSaleOrdersSeenKey,
  readSaleOrdersSeenAt,
  SALE_ORDERS_SEEN_EVENT,
  type NewSaleOrdersDb,
} from "@/lib/data/newSaleOrders";

const POLL_MS = 60 * 1000;

/**
 * Sale orders received since the dashboard was last opened (menu badge). One small count read
 * every minute while the browser tab is in front (React Query does not poll hidden tabs),
 * and when the window comes back into focus. 0 when `enabled` is false.
 */
export function useNewSaleOrderCount(enabled: boolean): number {
  const { currentOrganization } = useOrganization();
  const { user } = useAuth();
  const orgId = currentOrganization?.id;
  const userId = user?.id;
  const [seenAt, setSeenAt] = useState<string | null>(null);

  useEffect(() => {
    if (!orgId || !userId) return;
    setSeenAt(readSaleOrdersSeenAt(orgId, userId));
    const onSeen = (e: Event) => {
      const d = (e as CustomEvent<{ orgId: string; userId: string; iso: string }>).detail;
      if (d?.orgId === orgId && d.userId === userId) setSeenAt(d.iso);
    };
    const onStorage = (e: StorageEvent) => {
      if (isSaleOrdersSeenKey(e.key, orgId, userId) && e.newValue) setSeenAt(e.newValue);
    };
    window.addEventListener(SALE_ORDERS_SEEN_EVENT, onSeen);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SALE_ORDERS_SEEN_EVENT, onSeen);
      window.removeEventListener("storage", onStorage);
    };
  }, [orgId, userId]);

  const { data } = useQuery({
    queryKey: ["new-sale-orders-count", orgId, userId, seenAt],
    enabled: enabled && !!orgId && !!userId && !!seenAt,
    queryFn: () => countNewSaleOrders(supabase as unknown as NewSaleOrdersDb, orgId!, userId!, seenAt!),
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 30 * 1000,
    retry: false,
  });
  // New orders came in: the Sale Order Dashboard reloads if it is on screen (a hidden window
  // tab waits until it is shown again), and seeing them there clears the badge.
  const queryClient = useQueryClient();
  const count = enabled ? data ?? 0 : 0;
  useEffect(() => {
    if (count > 0 && orgId) void queryClient.invalidateQueries({ queryKey: ["sale-orders-list", orgId] });
  }, [count, orgId, queryClient]);
  return count;
}
