/**
 * Audit-only: layout-crossing navigation vs tab-cache watchdog coverage.
 * Does not change rescue timers — used to count pairs and classify gaps.
 */

import {
  isCacheableEntryTabPath,
  isEntryTabPath,
  isNoSidebarEntrySegment,
} from "@/lib/entryPageLayout";
import {
  resolveTabCachePath,
  TAB_PAGE_REGISTRY,
  type TabPageLayout,
} from "@/lib/tabPageRegistry";
import { usesLongLoadBudget } from "@/lib/tabCacheReadiness";

export const TAB_PAGE_LAYOUTS: TabPageLayout[] = ["layout", "fullscreen", "pos", "pos-dc"];

export type WatchdogCoverage = {
  /** 1.2s blank-frame → Outlet. Skipped on long-budget (bill/POS) destinations. */
  blankFrame12s: boolean;
  /** 4s stuck-pane → Outlet. Same skip as 1.2s; only meaningful when dest is tab-cache. */
  outletRescue4s: boolean;
  /** 6s remount of tab-cache chunk. Only purchase-entry (cacheable entry). */
  cacheableRemount6s: boolean;
  anyRescue: boolean;
};

/** Unique registry keys after alias collapse (same chunk counted once). */
export function uniqueRegistryPaths(): string[] {
  const seen = new Set<string>();
  for (const key of Object.keys(TAB_PAGE_REGISTRY)) {
    seen.add(resolveTabCachePath(key));
  }
  return [...seen].sort();
}

export function layoutForPath(path: string): TabPageLayout | null {
  const resolved = resolveTabCachePath(path);
  return TAB_PAGE_REGISTRY[resolved]?.layout ?? TAB_PAGE_REGISTRY[path]?.layout ?? null;
}

export function pathsByLayout(): Record<TabPageLayout, string[]> {
  const out: Record<TabPageLayout, string[]> = {
    layout: [],
    fullscreen: [],
    pos: [],
    "pos-dc": [],
  };
  for (const path of uniqueRegistryPaths()) {
    const layout = layoutForPath(path);
    if (layout) out[layout].push(path);
  }
  return out;
}

/** All directed pairs of different layouts (4×3 = 12). */
export function directedLayoutCrossingPairs(): Array<[TabPageLayout, TabPageLayout]> {
  const pairs: Array<[TabPageLayout, TabPageLayout]> = [];
  for (const from of TAB_PAGE_LAYOUTS) {
    for (const to of TAB_PAGE_LAYOUTS) {
      if (from !== to) pairs.push([from, to]);
    }
  }
  return pairs;
}

/**
 * Destination-driven coverage. The 1.2s / 4s timers key off the *current* path
 * after navigation (`usesLongLoadBudget`). The 6s remount keys off cacheable entry.
 */
export function watchdogCoverageForDestination(path: string): WatchdogCoverage {
  const resolved = resolveTabCachePath(path);
  const isEntry = isEntryTabPath(resolved);
  const isCacheable = isCacheableEntryTabPath(resolved);
  const posLike = isNoSidebarEntrySegment(resolved);
  const longBudget = usesLongLoadBudget(isEntry, isCacheable, posLike);
  const wantsTabCache = !isEntry || isCacheable;
  const blankFrame12s = !longBudget;
  const outletRescue4s = !longBudget && wantsTabCache;
  const cacheableRemount6s = isCacheable;
  return {
    blankFrame12s,
    outletRescue4s,
    cacheableRemount6s,
    anyRescue: blankFrame12s || outletRescue4s || cacheableRemount6s,
  };
}

/** Destinations with no watchdog at all (long-budget Outlet entries except purchase-entry). */
export function destinationsWithNoWatchdog(): string[] {
  return uniqueRegistryPaths().filter((p) => !watchdogCoverageForDestination(p).anyRescue);
}
