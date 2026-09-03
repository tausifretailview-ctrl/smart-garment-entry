import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  isTabCachePaneContentReady,
  isTabCachePaneMounted,
  markTabCachePaneContentReady,
  markTabCachePaneMounted,
  resetTabCacheMountRegistry,
} from "./tabCacheMountRegistry";
import {
  isPaintedTabSibling,
  paneLooksPaintedFromFlags,
  resolveTabPageFallbackKind,
  shouldArmOutletFallbackTimer,
  shouldRemountStuckCacheableEntry,
  shouldSilentTabSuspenseFallback,
  tabCacheWorkspaceLooksPainted,
  usesLongLoadBudget,
} from "./tabCacheReadiness";

const here = dirname(fileURLToPath(import.meta.url));

describe("tab-cache sibling readiness", () => {
  afterEach(() => {
    resetTabCacheMountRegistry();
  });

  it("does not count a chunk-loaded-but-never-mounted path as a ready sibling", () => {
    const chunkLoadedNeverMounted = isPaintedTabSibling({
      mounted: false,
      contentReady: false,
    });
    expect(chunkLoadedNeverMounted).toBe(false);

    markTabCachePaneMounted("stock-report");
    expect(isTabCachePaneMounted("stock-report")).toBe(true);
    expect(isTabCachePaneContentReady("stock-report")).toBe(false);
    expect(
      isPaintedTabSibling({
        mounted: isTabCachePaneMounted("stock-report"),
        contentReady: isTabCachePaneContentReady("stock-report"),
      }),
    ).toBe(false);
  });

  it("counts a mounted pane only after the lazy page has signalled ready", () => {
    markTabCachePaneMounted("pos-sales");
    markTabCachePaneContentReady("pos-sales");
    expect(
      isPaintedTabSibling({
        mounted: isTabCachePaneMounted("pos-sales"),
        contentReady: isTabCachePaneContentReady("pos-sales"),
      }),
    ).toBe(true);
  });

  it("renders the loading shell, not null, when no sibling is painted", () => {
    const silent = shouldSilentTabSuspenseFallback(false);
    expect(silent).toBe(false);
    expect(resolveTabPageFallbackKind(silent)).toBe("shell");
    expect(resolveTabPageFallbackKind(true)).toBe("empty");
  });

  it("never silences the Suspense fallback for POS / bill-entry shells", () => {
    expect(shouldSilentTabSuspenseFallback(true, "entry")).toBe(false);
    expect(shouldSilentTabSuspenseFallback(true, "dashboard")).toBe(true);
    expect(resolveTabPageFallbackKind(shouldSilentTabSuspenseFallback(true, "entry"))).toBe(
      "shell",
    );
  });
});

describe("usesLongLoadBudget is shared by watchdog and rescue timer", () => {
  it("exempts bill-entry screens", () => {
    expect(usesLongLoadBudget(true, false)).toBe(true);
    expect(usesLongLoadBudget(false, true)).toBe(true);
    expect(usesLongLoadBudget(false, false)).toBe(false);
    expect(usesLongLoadBudget(false, false, true)).toBe(true);
  });

  it("OrgLayout pane-ready gate requires content ready, not wrapper mount alone", () => {
    const src = readFileSync(join(here, "../components/OrgLayout.tsx"), "utf8");
    expect(src).toMatch(/isTabCachePaneMounted\(canonical\)/);
    expect(src).toMatch(/isTabCachePaneContentReady\(canonical\)/);
    expect(src).not.toMatch(/isTabPageChunkLoaded\(path\)/);
    expect(src).not.toMatch(/effectiveTabPaneReady = tabPaneReady \|\| tabPaneWasReady \|\| paneMounted/);
  });

  it("TabCachedPages always intent-prefetches on tab activation", () => {
    const src = readFileSync(join(here, "../components/TabCachedPages.tsx"), "utf8");
    expect(src).toMatch(/prefetchTabPage\(resolvedActivePath, \{ intent: true \}\)/);
  });

  it("TabCachedPages soft-retry runs even during silent cold-nav", () => {
    const src = readFileSync(join(here, "../components/TabCachedPages.tsx"), "utf8");
    expect(src).not.toMatch(/if \(!softFired && !silent\)/);
    expect(src).toMatch(/if \(silent && !showSoftHint\) return null/);
  });

  it("TabCachedPages soft-retry does not remount an in-flight chunk", () => {
    const src = readFileSync(join(here, "../components/TabCachedPages.tsx"), "utf8");
    expect(src).toMatch(/isTabPageChunkInFlight/);
    expect(src).toMatch(/if \(isTabPageChunkInFlight\(path\)\) return;/);
    expect(src).toMatch(/softRetryTabLoad[\s\S]*?\[retryTabLoad, path\]/);
  });

  it("TabCachedPages dims only the immediate predecessor during load", () => {
    const src = readFileSync(join(here, "../components/TabCachedPages.tsx"), "utf8");
    expect(src).toMatch(
      /dimOutgoing=\{\s*!isActive && dimOutgoingDuringLoad && path === prevActivePathRef\.current\s*\}/,
    );
    expect(src).toMatch(/const dimOutgoingDuringLoad = !activeChunkReady;/);
    expect(src).toMatch(/uniquePaths\.filter\(\(path\) => mounted\.has\(path\)\)/);
    expect(src).not.toMatch(/dimOutgoing=\{\s*!isActive && dimOutgoingDuringLoad\s*\}/);
  });

  it("OrgLayout watchdog and 6s rescue both import the same helper", () => {
    const src = readFileSync(join(here, "../components/OrgLayout.tsx"), "utf8");
    expect(src).toMatch(/usesLongLoadBudget/);
    expect(src).toMatch(/from ["']@\/lib\/tabCacheReadiness["']/);
    expect(src).toMatch(/hasPaintedWorkspaceContent/);
    expect(src).toMatch(/shouldRemountStuckCacheableEntry/);
    expect(src).toMatch(/CACHEABLE_ENTRY_STUCK_RESCUE_MS/);
    expect(src).toMatch(/POS_CONTEXT_WARM_TAB_PATH/);
    const rescueSkip = src.includes("shouldArmOutletFallbackTimer");
    const watchdogSkip = src.includes("if (usesLongLoadBudget || forceOutletFallback) return;");
    expect(rescueSkip).toBe(true);
    expect(watchdogSkip).toBe(true);
  });
});

describe("shouldArmOutletFallbackTimer", () => {
  const ready = {
    wantsTabCache: true,
    effectiveTabPaneReady: false,
    forceOutletFallback: false,
    usesLongLoadBudget: false,
    workspaceCanLoadChunk: true,
  };

  it("does not arm during org splash when the workspace cannot import yet", () => {
    expect(shouldArmOutletFallbackTimer({ ...ready, workspaceCanLoadChunk: false })).toBe(false);
  });

  it("arms a full 4s only after the workspace can load the dashboard chunk", () => {
    expect(shouldArmOutletFallbackTimer(ready)).toBe(true);
  });

  it("does not arm when the pane is already ready or already rescued", () => {
    expect(shouldArmOutletFallbackTimer({ ...ready, effectiveTabPaneReady: true })).toBe(false);
    expect(shouldArmOutletFallbackTimer({ ...ready, forceOutletFallback: true })).toBe(false);
    expect(shouldArmOutletFallbackTimer({ ...ready, usesLongLoadBudget: true })).toBe(false);
    expect(shouldArmOutletFallbackTimer({ ...ready, wantsTabCache: false })).toBe(false);
  });
});

describe("shouldRemountStuckCacheableEntry", () => {
  it("targets cacheable entry on tab-cache when content is not ready", () => {
    expect(
      shouldRemountStuckCacheableEntry({
        isCacheableEntryActive: true,
        contentReady: false,
        renderViaTabCache: true,
        forceOutletFallback: false,
      }),
    ).toBe(true);
  });

  it("does not remount after content is ready or on Outlet fallback", () => {
    expect(
      shouldRemountStuckCacheableEntry({
        isCacheableEntryActive: true,
        contentReady: true,
        renderViaTabCache: true,
        forceOutletFallback: false,
      }),
    ).toBe(false);
    expect(
      shouldRemountStuckCacheableEntry({
        isCacheableEntryActive: true,
        contentReady: false,
        renderViaTabCache: false,
        forceOutletFallback: false,
      }),
    ).toBe(false);
  });
});

describe("hasPaintedWorkspaceContent / pane paint flags", () => {
  it("treats empty dimmed outgoing panes as unpainted (sized chrome does not count)", () => {
    expect(
      tabCacheWorkspaceLooksPainted([
        { hasLoadShell: false, text: "", hasMediaOrControls: false },
      ]),
    ).toBe(false);
  });

  it("treats a dimmed outgoing pane that still holds the previous page as painted", () => {
    expect(
      tabCacheWorkspaceLooksPainted([
        { hasLoadShell: false, text: "Today's sales", hasMediaOrControls: false },
      ]),
    ).toBe(true);
  });

  it("treats an active load shell as painted so a slow destination is not swapped at 1.2s", () => {
    expect(
      paneLooksPaintedFromFlags({
        hasLoadShell: true,
        text: "",
        hasMediaOrControls: false,
      }),
    ).toBe(true);
  });
});
