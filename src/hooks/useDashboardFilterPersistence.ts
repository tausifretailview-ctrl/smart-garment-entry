import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  markDashboardFilterRestoring,
  readDashboardFilters,
  serializeDashboardFilters,
  writeDashboardFilters,
} from "@/lib/dashboardFilterPersistence";

export { isDashboardFilterRestoring } from "@/lib/dashboardFilterPersistence";

type UseDashboardFilterPersistenceOptions = {
  enabled?: boolean;
};

/**
 * Persists list/dashboard filter state in sessionStorage (per org + window route id).
 * Restores on remount so filters survive Electron single-tab unmount and tab switches.
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
): { filtersReady: boolean } {
  const { enabled = true } = options ?? {};
  const restoreKeyRef = useRef<string | null>(null);
  const skipPersistRef = useRef(true);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  const [filtersReady, setFiltersReady] = useState(() => {
    if (!enabled || !orgId || !dashboardId) return true;
    return readDashboardFilters(orgId, dashboardId) == null;
  });

  useLayoutEffect(() => {
    if (!enabled || !orgId || !dashboardId) {
      setFiltersReady(true);
      return;
    }

    const restoreKey = `${orgId}:${dashboardId}`;
    if (restoreKeyRef.current === restoreKey) return;
    restoreKeyRef.current = restoreKey;

    const saved = readDashboardFilters(orgId, dashboardId);
    if (saved) {
      markDashboardFilterRestoring();
      onRestoreRef.current(saved);
    }
    setFiltersReady(true);
  }, [enabled, orgId, dashboardId]);

  const serialized = useMemo(() => serializeDashboardFilters(filters), [filters]);

  useEffect(() => {
    if (!enabled || !orgId || !dashboardId) return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    const timer = window.setTimeout(() => {
      writeDashboardFilters(orgId, dashboardId, serialized);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [enabled, orgId, dashboardId, serialized]);

  return { filtersReady };
}
