import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import {
  clearDashboardFilters,
  isUsablePersistenceUserId,
  markDashboardFilterRestoring,
  readDashboardFilters,
  serializeDashboardFilters,
  writeDashboardFilters,
} from "@/lib/dashboardFilterPersistence";

export { isDashboardFilterRestoring } from "@/lib/dashboardFilterPersistence";

/** Sync read for dashboard filter initial state (avoids default-then-restore query flash). */
export function readInitialDashboardFilters(
  orgId: string | undefined,
  dashboardId: string,
  userId?: string | null,
): Record<string, unknown> | null {
  if (!orgId || !dashboardId || !isUsablePersistenceUserId(userId)) return null;
  return readDashboardFilters(orgId, dashboardId, userId);
}

type UseDashboardFilterPersistenceOptions = {
  enabled?: boolean;
};

/**
 * Persists list/dashboard filter state in localStorage (per org + user + window id).
 * Survives pane retention expiry and browser restarts; day-boundary sanitization
 * keeps relative periods ("daily" / "this month") from freezing yesterday's dates.
 *
 * Returns `filtersReady` — false until saved filters are applied so queries do not
 * fetch with default keys and then refetch after restore (avoids loading flash).
 */
export function useDashboardFilterPersistence(
  dashboardId: string,
  orgId: string | undefined,
  filters: Record<string, unknown>,
  onRestore: (saved: Record<string, unknown>) => void,
  options?: UseDashboardFilterPersistenceOptions,
): { filtersReady: boolean; clearPersistedFilters: () => void } {
  const { enabled = true } = options ?? {};
  const { user } = useAuth();
  const userId = isUsablePersistenceUserId(user?.id) ? user.id : null;

  const restoreKeyRef = useRef<string | null>(null);
  const skipPersistRef = useRef(true);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  const [filtersReady, setFiltersReady] = useState(() => {
    // Wait for auth — never treat "no user yet" as "no saved filters".
    if (!enabled || !dashboardId) return true;
    if (!orgId || !userId) return false;
    return readDashboardFilters(orgId, dashboardId, userId) == null;
  });

  useLayoutEffect(() => {
    if (!enabled || !dashboardId) {
      setFiltersReady(true);
      return;
    }
    if (!orgId || !userId) {
      // Skip restore/persist until both org and user are resolved.
      setFiltersReady(false);
      return;
    }

    const restoreKey = `${orgId}:${userId}:${dashboardId}`;
    if (restoreKeyRef.current === restoreKey) return;
    restoreKeyRef.current = restoreKey;
    skipPersistRef.current = true;

    const saved = readDashboardFilters(orgId, dashboardId, userId);
    if (saved) {
      markDashboardFilterRestoring();
      onRestoreRef.current(saved);
    }
    setFiltersReady(true);
  }, [enabled, orgId, userId, dashboardId]);

  const serialized = useMemo(() => serializeDashboardFilters(filters), [filters]);

  useEffect(() => {
    if (!enabled || !orgId || !dashboardId || !userId) return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      writeDashboardFilters(orgId, dashboardId, serialized, userId);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [enabled, orgId, userId, dashboardId, serialized]);

  const clearPersistedFilters = () => {
    if (!orgId || !dashboardId || !userId) return;
    clearDashboardFilters(orgId, dashboardId, userId);
  };

  return { filtersReady, clearPersistedFilters };
}
