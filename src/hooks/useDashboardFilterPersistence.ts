import { useEffect, useMemo, useRef } from "react";
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
 * Entity fields (selectedCustomerId, selectedSupplierId, customerId) are plain strings
 * in the snapshot — use restoreDashboardFilters `entityIds` for those setters.
 * Skip entity restore when URL has ?customer= / ?customerId= (apply URL first).
 */
export function useDashboardFilterPersistence(
  dashboardId: string,
  orgId: string | undefined,
  filters: Record<string, unknown>,
  onRestore: (saved: Record<string, unknown>) => void,
  options?: UseDashboardFilterPersistenceOptions,
): void {
  const { enabled = true } = options ?? {};
  const restoredRef = useRef(false);
  const skipPersistRef = useRef(true);
  const onRestoreRef = useRef(onRestore);
  onRestoreRef.current = onRestore;

  const serialized = useMemo(() => serializeDashboardFilters(filters), [filters]);

  useEffect(() => {
    if (!enabled || !orgId || !dashboardId || restoredRef.current) return;
    restoredRef.current = true;
    const saved = readDashboardFilters(orgId, dashboardId);
    if (saved) {
      markDashboardFilterRestoring();
      onRestoreRef.current(saved);
    }
  }, [enabled, orgId, dashboardId]);

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
}
