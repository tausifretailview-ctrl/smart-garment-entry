import {
  INVENTORY_TAB_PREFETCH_PATHS,
  MASTER_TAB_PREFETCH_PATHS,
} from "@/lib/chunkLoadRetry";

/**
 * Keep recently visited Master/Inventory panes mounted after the window-tab path
 * is replaced (sidebar nav), so Customer↔Supplier-style switches are visibility
 * toggles — Sales-tab parity without ballooning Electron mounted-pane count.
 *
 * Window ≈ `STALE_DASHBOARD_TAB_RETURN` (2 min) × ~2.5; 5 min matches segment
 * query staleTime on Customer Master.
 */
export const RECENT_TAB_PANE_RETENTION_MS = 5 * 60 * 1000;

/** LRU cap — load-bearing vs TabCachedPages idle eviction / Electron OOM history. */
export const RECENT_TAB_PANE_RETENTION_MAX = 5;

/**
 * Derived from prefetch path lists so retention and intent-warm cannot drift.
 * Sales dashboards already stay mounted via separate numbered window tabs.
 */
export const RETAINABLE_TAB_CACHE_PATHS: ReadonlySet<string> = new Set([
  ...MASTER_TAB_PREFETCH_PATHS,
  ...INVENTORY_TAB_PREFETCH_PATHS,
]);

export function isRetainableTabCachePath(path: string): boolean {
  return RETAINABLE_TAB_CACHE_PATHS.has(path);
}

/**
 * Record an outgoing path and return the paths still within the retention window
 * (excluding `currentPath`), capped by LRU.
 */
export function bumpRecentTabPaneRetention(
  recentByPath: Map<string, number>,
  outgoingPath: string | null | undefined,
  currentPath: string,
  now = Date.now(),
): string[] {
  for (const [path, at] of [...recentByPath.entries()]) {
    if (now - at > RECENT_TAB_PANE_RETENTION_MS) {
      recentByPath.delete(path);
    }
  }

  if (
    outgoingPath &&
    outgoingPath !== currentPath &&
    isRetainableTabCachePath(outgoingPath)
  ) {
    recentByPath.set(outgoingPath, now);
  }

  // Current path is already in tabPaths via openWindows / current — drop from retention set.
  recentByPath.delete(currentPath);

  while (recentByPath.size > RECENT_TAB_PANE_RETENTION_MAX) {
    let oldestPath: string | null = null;
    let oldestAt = Infinity;
    for (const [path, at] of recentByPath) {
      if (at < oldestAt) {
        oldestAt = at;
        oldestPath = path;
      }
    }
    if (!oldestPath) break;
    recentByPath.delete(oldestPath);
  }

  return [...recentByPath.keys()];
}
