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

  it("OrgLayout watchdog and 6s rescue both import the same helper", () => {
    const src = readFileSync(join(here, "../components/OrgLayout.tsx"), "utf8");
    expect(src).toMatch(/usesLongLoadBudget/);
    expect(src).toMatch(/from ["']@\/lib\/tabCacheReadiness["']/);
    expect(src).toMatch(/hasPaintedWorkspaceContent/);
    const rescueSkip = src.includes("if (usesLongLoadBudget) return;");
    const watchdogSkip = src.includes("if (usesLongLoadBudget || forceOutletFallback) return;");
    expect(rescueSkip).toBe(true);
    expect(watchdogSkip).toBe(true);
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
