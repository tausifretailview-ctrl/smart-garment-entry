import { useCallback, useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  invalidateMoneyViewFreshness,
  MONEY_VIEW_FRESHNESS_DEBOUNCE_MS,
} from "@/utils/moneyViewFreshnessInvalidation";
import {
  MONEY_VIEW_FRESHNESS_LS_KEY,
  parseMoneyFreshnessMarker,
} from "@/utils/posSalesRefresh";

const MONEY_REALTIME_TABLES = [
  "sales",
  "voucher_entries",
  "sale_returns",
  "customer_advances",
  "credit_notes",
] as const;

export function useOrgMoneyRealtimeInvalidation() {
  const { currentOrganization } = useOrganization();
  const queryClient = useQueryClient();
  const orgId = currentOrganization?.id;
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleInvalidate = useCallback(() => {
    if (!orgId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null;
      invalidateMoneyViewFreshness(queryClient, orgId);
    }, MONEY_VIEW_FRESHNESS_DEBOUNCE_MS);
  }, [orgId, queryClient]);

  useEffect(() => {
    if (!orgId) return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== MONEY_VIEW_FRESHNESS_LS_KEY || !event.newValue) return;
      const marker = parseMoneyFreshnessMarker(event.newValue);
      if (!marker) return;
      if (marker.organizationId && marker.organizationId !== orgId) return;
      scheduleInvalidate();
    };
    window.addEventListener("storage", onStorage);

    let channel = supabase.channel(`money-freshness-${orgId}`);
    for (const table of MONEY_REALTIME_TABLES) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `organization_id=eq.${orgId}`,
        },
        scheduleInvalidate,
      );
    }
    channel.subscribe();

    return () => {
      window.removeEventListener("storage", onStorage);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [orgId, scheduleInvalidate]);
}

/** Mount once under Layout (org context available). */
export function OrgMoneyRealtimeInvalidation() {
  useOrgMoneyRealtimeInvalidation();
  return null;
}
