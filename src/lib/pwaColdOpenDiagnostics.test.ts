/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildPaneTimelineReport,
  classifySpinnerChrome,
  getPwaColdOpenSnapshots,
  getPaneTimelineEvents,
  getTabChunkLoadEvents,
  panePathFromLocation,
  recordPaneTimelineEvent,
  recordPwaColdOpenSnapshot,
  recordTabChunkLoadEvent,
  resetPwaColdOpenDiagnosticsForTests,
} from "./pwaColdOpenDiagnostics";

const here = dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  resetPwaColdOpenDiagnosticsForTests();
  document.body.innerHTML = "";
  if (typeof localStorage !== "undefined") localStorage.clear();
  vi.restoreAllMocks();
});

describe("classifySpinnerChrome", () => {
  it("detects boot splash", () => {
    document.body.innerHTML =
      '<div data-ezzy-load-shell="splash">Loading organization…</div>';
    expect(classifySpinnerChrome(document)).toEqual({
      kind: "boot-splash",
      text: "Loading organization…",
    });
  });

  it("detects MenuPermissionRoute Loader2", () => {
    document.body.innerHTML =
      '<div data-ezzy-spinner="menu-permission"><p>Loading…</p></div>';
    expect(classifySpinnerChrome(document).kind).toBe("menu-permission-loader");
  });

  it("detects dashboard load shell", () => {
    document.body.innerHTML = '<div data-ezzy-load-shell="dashboard">Loading dashboard</div>';
    expect(classifySpinnerChrome(document).kind).toBe("load-shell");
  });

  it("is none when the workspace is painted without a spinner", () => {
    document.body.innerHTML = "<main><h1>Dashboard</h1></main>";
    expect(classifySpinnerChrome(document).kind).toBe("none");
  });
});

describe("recordPwaColdOpenSnapshot", () => {
  it("records the requested stuck-frame fields and dedupes identical rows", () => {
    const row = {
      path: "",
      forceOutletFallback: false,
      effectiveTabPaneReady: false,
      dashboardChunkLoaded: false,
      orgLoading: false,
      permissionsIsFetching: true,
      permissionsFetchStatus: "fetching",
      spinnerKind: "menu-permission-loader" as const,
      spinnerText: "Loading…",
    };
    recordPwaColdOpenSnapshot(row);
    recordPwaColdOpenSnapshot(row);
    expect(getPwaColdOpenSnapshots()).toHaveLength(1);
    const snap = getPwaColdOpenSnapshots()[0];
    expect(snap.forceOutletFallback).toBe(false);
    expect(snap.effectiveTabPaneReady).toBe(false);
    expect(snap.dashboardChunkLoaded).toBe(false);
    expect(snap.orgLoading).toBe(false);
    expect(snap.permissionsIsFetching).toBe(true);
    expect(snap.permissionsFetchStatus).toBe("fetching");
  });
});

describe("OrgLayout wires the probe", () => {
  it("records forceOutletFallback, pane ready, dashboard chunk, orgLoading, permissions fetch", () => {
    const src = readFileSync(join(here, "../components/OrgLayout.tsx"), "utf8");
    expect(src).toContain("recordPwaColdOpenSnapshot");
    expect(src).toContain("isTabPageChunkLoaded(\"\")");
    expect(src).toContain("permissionsIsFetching");
    expect(src).toContain("permissionsFetchStatus");
    expect(src).toContain("forceOutletFallback");
    expect(src).toContain("effectiveTabPaneReady");
    expect(src).toContain("orgLoading");
    expect(src).toContain("chunkLoadedBeforeReset");
    expect(src).toContain("shouldArmOutletFallbackTimer");
    expect(src).toContain("recordPaneTimelineEvent(resolvedCurrentPath, \"rescue\")");
  });
});

describe("tab chunk load events", () => {
  it("records start/resolve so rescue cannot hide a completed import", () => {
    recordTabChunkLoadEvent("", "start", 1_000);
    recordTabChunkLoadEvent("", "resolved", 3_500);
    const events = getTabChunkLoadEvents();
    expect(events).toHaveLength(2);
    expect(events[0].phase).toBe("start");
    expect(events[1].phase).toBe("resolved");
  });

  it("does not console.info snapshots unless ezzy_pwa_cold_open=1", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    recordTabChunkLoadEvent("", "start", 1);
    expect(spy).not.toHaveBeenCalled();
    localStorage.setItem("ezzy_pwa_cold_open", "1");
    recordTabChunkLoadEvent("", "resolved", 2);
    expect(spy).toHaveBeenCalled();
  });
});

describe("pane timeline (flag-gated)", () => {
  it("is a no-op without the flag", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    expect(recordPaneTimelineEvent("settings", "onReady", 10)).toBeNull();
    expect(getPaneTimelineEvents()).toHaveLength(0);
    expect(spy).not.toHaveBeenCalled();
    recordTabChunkLoadEvent("settings", "start", 1);
    expect(getPaneTimelineEvents()).toHaveLength(0);
  });

  it("records chunk, roles, onReady, and rescue per pane when the flag is on", () => {
    localStorage.setItem("ezzy_pwa_cold_open", "1");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});

    recordTabChunkLoadEvent("", "start", 1_000);
    recordTabChunkLoadEvent("", "resolved", 2_500);
    recordPaneTimelineEvent("", "onReady", 2_600);
    recordPaneTimelineEvent("", "rescue", 5_000);

    recordTabChunkLoadEvent("settings", "start", 6_000);
    recordPaneTimelineEvent("settings", "roles-children-mounted", 6_400);
    recordTabChunkLoadEvent("settings", "resolved", 8_000);
    recordPaneTimelineEvent("settings", "onReady", 8_100);

    const events = getPaneTimelineEvents();
    expect(events.map((e) => `${e.path || "(dashboard)"}:${e.phase}`)).toEqual([
      "(dashboard):chunk-start",
      "(dashboard):chunk-resolved",
      "(dashboard):onReady",
      "(dashboard):rescue",
      "settings:chunk-start",
      "settings:roles-children-mounted",
      "settings:chunk-resolved",
      "settings:onReady",
    ]);
    expect(spy).toHaveBeenCalled();

    const report = buildPaneTimelineReport();
    expect(report).toContain("=== pane (dashboard) ===");
    expect(report).toContain("=== pane settings ===");
    expect(report).toContain("chunk-start");
    expect(report).toContain("roles-children-mounted");
    expect(report).toContain("onReady");
    expect(report).toContain("rescue");
    expect(report).toContain("+4000ms");
  });

  it("maps org URLs to registry pane paths", () => {
    expect(panePathFromLocation("/ranawats-bling/settings", "ranawats-bling")).toBe("settings");
    expect(panePathFromLocation("/ranawats-bling", "ranawats-bling")).toBe("");
    expect(panePathFromLocation("/ranawats-bling/", "ranawats-bling")).toBe("");
  });
});

describe("call sites wire the pane timeline", () => {
  it("records onReady from TabCachedPages and roles-children-mounted from RoleProtectedRoute", () => {
    const tabs = readFileSync(join(here, "../components/TabCachedPages.tsx"), "utf8");
    expect(tabs).toContain('recordPaneTimelineEvent(path, "onReady")');
    expect(tabs).toContain("TabCachePanePathContext.Provider");

    const roles = readFileSync(join(here, "../components/RoleProtectedRoute.tsx"), "utf8");
    expect(roles).toContain('recordPaneTimelineEvent(');
    expect(roles).toContain('"roles-children-mounted"');
  });
});
