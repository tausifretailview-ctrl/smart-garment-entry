import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { invalidatePosDashboardQueries } from "@/utils/posDashboardSales";

/**
 * Coalesce write bursts — one POS save touches sales + items + vouchers in
 * quick succession, and bulk deletes fire per-row events. Longer than the
 * money-freshness debounce so deleteLedgerEntries and friends settle first.
 */
const POS_DASHBOARD_REALTIME_DEBOUNCE_MS = 1500;

/**
 * Live-refresh the POS dashboard when sales change anywhere (another tab,
 * another device, POS billing). Same pattern as
 * useOrgMoneyRealtimeInvalidation, scoped to the dashboard's own query
 * prefix so it never fans out into broad money-view refetches.
 *
 * Manual Refresh + delete-time invalidation stay untouched as fallback for
 * tenants where Realtime is blocked. Never patch cache from raw Realtime
 * payloads — only invalidate and let the (version-gated) queries settle.
 */
export function usePosDashboardRealtimeRefresh(organizationId?: string) {
  const queryClient = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!organizationId) return;

    const scheduleRefresh = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        invalidatePosDashboardQueries(queryClient, organizationId);
      }, POS_DASHBOARD_REALTIME_DEBOUNCE_MS);
    };

    const channel = supabase
      .channel(`pos-dashboard-${organizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sales",
          filter: `organization_id=eq.${organizationId}`,
        },
        scheduleRefresh,
      );
    void channel.subscribe();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      void supabase.removeChannel(channel);
    };
  }, [organizationId, queryClient]);
}
