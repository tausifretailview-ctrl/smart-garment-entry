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
  markMoneyFreshnessApplied,
  readAppliedMoneyFreshnessTs,
  readStoredMoneyFreshnessMarker,
  shouldApplyMoneyFreshnessMarker,
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

  const flushInvalidate = useCallback(() => {
    if (!orgId) return;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    invalidateMoneyViewFreshness(queryClient, orgId);
  }, [orgId, queryClient]);

  const applyStoredFreshness = useCallback(
    (immediate: boolean) => {
      if (!orgId) return;
      const marker = readStoredMoneyFreshnessMarker();
      if (
        !shouldApplyMoneyFreshnessMarker(marker, {
          organizationId: orgId,
          lastAppliedTs: readAppliedMoneyFreshnessTs(),
        })
      ) {
        return;
      }
      markMoneyFreshnessApplied(marker!.ts);
      if (immediate) flushInvalidate();
      else scheduleInvalidate();
    },
    [orgId, flushInvalidate, scheduleInvalidate],
  );

  useEffect(() => {
    if (!orgId) return;

    const onStorage = (event: StorageEvent) => {
      if (event.key !== MONEY_VIEW_FRESHNESS_LS_KEY || !event.newValue) return;
      applyStoredFreshness(false);
    };
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      // A timer started while this Chrome tab was hidden can be delayed for
      // minutes. Flush as soon as the user looks at the tab.
      if (debounceRef.current) flushInvalidate();
      applyStoredFreshness(true);
    };
    applyStoredFreshness(true);
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onVisible);

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
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onVisible);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [orgId, applyStoredFreshness, flushInvalidate, scheduleInvalidate]);
}

/** Mount once under Layout (org context available). */
export function OrgMoneyRealtimeInvalidation() {
  useOrgMoneyRealtimeInvalidation();
  return null;
}
