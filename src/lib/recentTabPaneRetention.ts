import {
  isCacheableEntryTabPath,
  isEntryFullscreenPath,
  isNoSidebarEntryPath,
} from "@/lib/entryPageLayout";
import { isTabCachePath, resolveTabCachePath } from "@/lib/tabPageRegistry";

/** Bill/POS entry segments — remount / scanner semantics; do not retain. */
function isNonRetainableEntrySegment(path: string): boolean {
  const segment = path.replace(/^\/+|\/+$/g, "");
  if (!segment) return false;
  if (isCacheableEntryTabPath(segment)) return false; // purchase-entry stays retainable
  const asPath = `/${segment}`;
  return isNoSidebarEntryPath(asPath) || isEntryFullscreenPath(asPath);
}

/**
 * Keep recently visited cacheable panes mounted after the window-tab path is
 * replaced (sidebar nav), so Settings↔Accounts↔Master switches are visibility
 * toggles — Sales-tab parity without ballooning Electron mounted-pane count.
 *
 * Default-retain every cacheable registry path; exclude only pages that must
 * remount or stay idle-evictable. Prefetch-list unions drift as pages are added.
 *
 * Window: 5 min (matches Customer Master segment staleTime / ~2.5× dashboard
 * tab-return stale). LRU cap is the load-bearing guard once the set is wide.
 */
export const RECENT_TAB_PANE_RETENTION_MS = 5 * 60 * 1000;

/**
 * LRU cap — raised 5 → 7 with the widened retainable set so Accounts/Settings
 * survive a longer tour without keeping 20 live React trees. Still under the
 * Electron OOM history that motivated TabCachedPages idle eviction.
 */
export const RECENT_TAB_PANE_RETENTION_MAX = 7;

/**
 * Explicit exclusions from recently-visited retention.
 * - `user-rights`: sole path in TabCachedPages `IDLE_EVICT_ALLOWED_PATHS` —
 *   keep it evictable; retention must not override that policy.
 */
export const RECENT_TAB_PANE_RETENTION_EXCLUSIONS: ReadonlySet<string> = new Set([
  "user-rights",
]);

/**
 * True when a path may be kept in OrgLayout `tabPaths` after navigation away.
 * Requires TAB_PAGE_REGISTRY membership (via isTabCachePath). Bill/POS entry
 * screens are excluded unless they are cacheable entries (purchase-entry) —
 * those carry scanners / intentional remount semantics.
 */
export function isRetainableTabCachePath(path: string): boolean {
  const resolved = resolveTabCachePath(path);
  if (!resolved) return false;
  if (RECENT_TAB_PANE_RETENTION_EXCLUSIONS.has(resolved)) return false;
  if (!isTabCachePath(resolved)) return false;
  if (isNonRetainableEntrySegment(resolved)) return false;
  return true;
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
  const current = resolveTabCachePath(currentPath);

  for (const [path, at] of [...recentByPath.entries()]) {
    if (now - at > RECENT_TAB_PANE_RETENTION_MS || !isRetainableTabCachePath(path)) {
      recentByPath.delete(path);
    }
  }

  if (outgoingPath) {
    const outgoing = resolveTabCachePath(outgoingPath);
    if (outgoing && outgoing !== current && isRetainableTabCachePath(outgoing)) {
      recentByPath.set(outgoing, now);
    }
  }

  // Current path is already in tabPaths via openWindows / current — drop from retention set.
  if (current) recentByPath.delete(current);

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
