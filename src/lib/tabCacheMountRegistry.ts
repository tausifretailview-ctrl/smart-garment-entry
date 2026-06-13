import { resolveTabCachePath } from "@/lib/tabPageRegistry";

/** Tracks tab-cache panes currently mounted (hidden or visible) — not URL router state. */
const mountedTabCachePaths = new Set<string>();

export function markTabCachePaneMounted(path: string): void {
  mountedTabCachePaths.add(resolveTabCachePath(path));
}

export function markTabCachePaneUnmounted(path: string): void {
  mountedTabCachePaths.delete(resolveTabCachePath(path));
}

export function isTabCachePaneMounted(path: string): boolean {
  return mountedTabCachePaths.has(resolveTabCachePath(path));
}

/** Clear all entries — test / full app teardown only. */
export function resetTabCacheMountRegistry(): void {
  mountedTabCachePaths.clear();
}
