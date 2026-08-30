/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifySpinnerChrome,
  getPwaColdOpenSnapshots,
  getTabChunkLoadEvents,
  recordPwaColdOpenSnapshot,
  recordTabChunkLoadEvent,
  resetPwaColdOpenDiagnosticsForTests,
} from "./pwaColdOpenDiagnostics";

const here = dirname(fileURLToPath(import.meta.url));

afterEach(() => {
  resetPwaColdOpenDiagnosticsForTests();
  document.body.innerHTML = "";
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
});
