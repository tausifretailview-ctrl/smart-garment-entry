import { resolveTabCachePath } from "@/lib/tabPageRegistry";

/** Tracks tab-cache panes currently mounted (hidden or visible) — not URL router state. */
const mountedTabCachePaths = new Set<string>();
/** Lazy page committed (Suspense resolved / onReady). Wrapper mount is not enough. */
const readyTabCachePaths = new Set<string>();

export function markTabCachePaneMounted(path: string): void {
  mountedTabCachePaths.add(resolveTabCachePath(path));
}

export function markTabCachePaneUnmounted(path: string): void {
  const resolved = resolveTabCachePath(path);
  mountedTabCachePaths.delete(resolved);
  readyTabCachePaths.delete(resolved);
}

export function isTabCachePaneMounted(path: string): boolean {
  return mountedTabCachePaths.has(resolveTabCachePath(path));
}

/** Fired from CachedTabPane after the lazy page commits — the existing onReady signal. */
export function markTabCachePaneContentReady(path: string): void {
  readyTabCachePaths.add(resolveTabCachePath(path));
}

export function isTabCachePaneContentReady(path: string): boolean {
  return readyTabCachePaths.has(resolveTabCachePath(path));
}

/** Clear all entries — test / full app teardown only. */
export function resetTabCacheMountRegistry(): void {
  mountedTabCachePaths.clear();
  readyTabCachePaths.clear();
}
