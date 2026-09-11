/**
 * PWA cold-open blank Dashboard — stuck-frame probe.
 *
 * Evidence only. Does not change render owner, prefetch, or rescue timers.
 *
 * Stuck-frame snapshots + chunk start/resolve stay in-memory always (field
 * readout after the fact). Console and the per-pane timeline (roles / onReady /
 * 4s rescue) are opt-in:
 *   localStorage.setItem("ezzy_pwa_cold_open", "1")
 *   ?pwacold=1
 *   ?ezzy_pwa_cold_open=1
 * Readout: window.__ezzyColdOpen.print()
 * Grep: [PWAColdOpen]
 *
 * ELLA NOOR 2026-08-30: forceOutletFallback flipped because the 4s timer
 * armed during org splash. See docs/pwa-cold-open-chunk-ready-2026-08-30.md.
 */

import { diagConsoleInfo, isDiagConsoleEnabled } from "@/lib/diagConsole";

/** localStorage key, `?pwacold=1`, or `?ezzy_pwa_cold_open=1`. */
export function isPwaColdOpenDiagEnabled(): boolean {
  return isDiagConsoleEnabled("ezzy_pwa_cold_open", "pwacold");
}

export type PwaSpinnerKind =
  | "boot-splash"
  | "menu-permission-loader"
  | "load-shell"
  | "loader2"
  | "dashboard-cards"
  | "none"
  | "unknown";

export type PwaColdOpenSnapshot = {
  at: number;
  path: string;
  forceOutletFallback: boolean;
  effectiveTabPaneReady: boolean;
  dashboardChunkLoaded: boolean;
  dashboardChunkInFlight: boolean;
  orgLoading: boolean;
  permissionsIsFetching: boolean | null;
  permissionsFetchStatus: string | null;
  spinnerKind: PwaSpinnerKind;
  spinnerText: string;
};

export type TabChunkLoadPhase = "start" | "resolved" | "failed";

export type TabChunkLoadEvent = {
  at: number;
  path: string;
  phase: TabChunkLoadPhase;
};

/** Per-pane cold-open timeline. Console + ring only when the probe flag is on. */
export type PaneTimelinePhase =
  | "chunk-start"
  | "chunk-resolved"
  | "chunk-failed"
  | "roles-children-mounted"
  | "onReady"
  | "rescue";

export type PaneTimelineEvent = {
  at: number;
  path: string;
  phase: PaneTimelinePhase;
};

const MAX_SNAPSHOTS = 40;
const MAX_CHUNK_EVENTS = 40;
const MAX_PANE_TIMELINE = 80;
const snapshots: PwaColdOpenSnapshot[] = [];
const chunkEvents: TabChunkLoadEvent[] = [];
const paneTimeline: PaneTimelineEvent[] = [];
let lastFingerprint = "";

export function resetPwaColdOpenDiagnosticsForTests(): void {
  snapshots.length = 0;
  chunkEvents.length = 0;
  paneTimeline.length = 0;
  lastFingerprint = "";
}

const CHUNK_PHASE_TO_TIMELINE: Record<TabChunkLoadPhase, PaneTimelinePhase> = {
  start: "chunk-start",
  resolved: "chunk-resolved",
  failed: "chunk-failed",
};

function pushPaneTimeline(row: PaneTimelineEvent): void {
  paneTimeline.push(row);
  if (paneTimeline.length > MAX_PANE_TIMELINE) paneTimeline.shift();
}

/**
 * Flag-gated pane timeline. No-op when ezzy_pwa_cold_open / ?pwacold is off
 * so normal sessions pay only this boolean check.
 */
export function recordPaneTimelineEvent(
  path: string,
  phase: PaneTimelinePhase,
  at?: number,
): PaneTimelineEvent | null {
  if (!isPwaColdOpenDiagEnabled()) return null;
  const row: PaneTimelineEvent = {
    at: at ?? Date.now(),
    path,
    phase,
  };
  pushPaneTimeline(row);
  diagConsoleInfo(
    "ezzy_pwa_cold_open",
    "pwacold",
    "[PWAColdOpen] pane",
    path || "(dashboard)",
    phase,
    row.at,
  );
  exposePwaColdOpenApi();
  return row;
}

export function getPaneTimelineEvents(): PaneTimelineEvent[] {
  return [...paneTimeline];
}

/** Org URL `/{slug}/settings` → `settings`; `/{slug}` → `""` (dashboard). */
export function panePathFromLocation(pathname: string, orgSlug?: string | null): string {
  if (orgSlug && pathname.startsWith(`/${orgSlug}/`)) {
    return pathname.slice(orgSlug.length + 2);
  }
  if (orgSlug && (pathname === `/${orgSlug}` || pathname === `/${orgSlug}/`)) {
    return "";
  }
  const parts = pathname.replace(/^\//, "").split("/").filter(Boolean);
  return parts.length <= 1 ? "" : parts.slice(1).join("/");
}

export function buildPaneTimelineReport(events: PaneTimelineEvent[] = paneTimeline): string {
  if (events.length === 0) return "(no pane timeline — enable ezzy_pwa_cold_open=1 or ?pwacold=1)";
  const byPath = new Map<string, PaneTimelineEvent[]>();
  for (const e of events) {
    const key = e.path;
    const list = byPath.get(key);
    if (list) list.push(e);
    else byPath.set(key, [e]);
  }
  const blocks: string[] = [];
  for (const [path, rows] of byPath) {
    const t0 = rows[0]?.at ?? 0;
    const lines = rows.map((e) => {
      const dt = e.at - t0;
      return `  +${dt}ms  ${e.phase}  ${new Date(e.at).toISOString()}`;
    });
    blocks.push(`=== pane ${path || "(dashboard)"} ===\n${lines.join("\n")}`);
  }
  return blocks.join("\n");
}

export function recordTabChunkLoadEvent(
  path: string,
  phase: TabChunkLoadPhase,
  at?: number,
): TabChunkLoadEvent {
  const row: TabChunkLoadEvent = {
    at: at ?? Date.now(),
    path,
    phase,
  };
  chunkEvents.push(row);
  if (chunkEvents.length > MAX_CHUNK_EVENTS) chunkEvents.shift();
  diagConsoleInfo(
    "ezzy_pwa_cold_open",
    "pwacold",
    "[PWAColdOpen] chunk",
    path || "(dashboard)",
    phase,
  );
  if (isPwaColdOpenDiagEnabled()) {
    pushPaneTimeline({
      at: row.at,
      path,
      phase: CHUNK_PHASE_TO_TIMELINE[phase],
    });
  }
  exposePwaColdOpenApi();
  return row;
}

export function getTabChunkLoadEvents(): TabChunkLoadEvent[] {
  return [...chunkEvents];
}

export function classifySpinnerChrome(root: ParentNode | null | undefined): {
  kind: PwaSpinnerKind;
  text: string;
} {
  if (!root || typeof (root as Element).querySelector !== "function") {
    return { kind: "unknown", text: "" };
  }
  const el = root as ParentNode;
  const splash = el.querySelector('[data-ezzy-load-shell="splash"]');
  if (splash) {
    return { kind: "boot-splash", text: (splash.textContent ?? "").replace(/\s+/g, " ").trim() };
  }
  const menu = el.querySelector('[data-ezzy-spinner="menu-permission"]');
  if (menu) {
    return {
      kind: "menu-permission-loader",
      text: (menu.textContent ?? "").replace(/\s+/g, " ").trim(),
    };
  }
  const shell = el.querySelector("[data-ezzy-load-shell]");
  if (shell) {
    return {
      kind: "load-shell",
      text: (shell.textContent ?? "").replace(/\s+/g, " ").trim(),
    };
  }
  const cards = el.querySelector("[data-ezzy-spinner='dashboard-cards']");
  if (cards) {
    return { kind: "dashboard-cards", text: "dashboard-cards" };
  }
  const spin = el.querySelector(".animate-spin");
  if (spin) {
    const parent = spin.closest("div") ?? spin.parentElement;
    return {
      kind: "loader2",
      text: (parent?.textContent ?? "").replace(/\s+/g, " ").trim(),
    };
  }
  return { kind: "none", text: "" };
}

export function recordPwaColdOpenSnapshot(
  input: Omit<PwaColdOpenSnapshot, "at" | "dashboardChunkInFlight"> & {
    at?: number;
    dashboardChunkInFlight?: boolean;
  },
): PwaColdOpenSnapshot {
  const snap: PwaColdOpenSnapshot = {
    at: input.at ?? Date.now(),
    path: input.path,
    forceOutletFallback: input.forceOutletFallback,
    effectiveTabPaneReady: input.effectiveTabPaneReady,
    dashboardChunkLoaded: input.dashboardChunkLoaded,
    dashboardChunkInFlight: input.dashboardChunkInFlight ?? false,
    orgLoading: input.orgLoading,
    permissionsIsFetching: input.permissionsIsFetching,
    permissionsFetchStatus: input.permissionsFetchStatus,
    spinnerKind: input.spinnerKind,
    spinnerText: input.spinnerText,
  };
  const fingerprint = [
    snap.path,
    snap.forceOutletFallback,
    snap.effectiveTabPaneReady,
    snap.dashboardChunkLoaded,
    snap.dashboardChunkInFlight,
    snap.orgLoading,
    snap.permissionsIsFetching,
    snap.permissionsFetchStatus,
    snap.spinnerKind,
  ].join("|");
  if (fingerprint === lastFingerprint) return snap;
  lastFingerprint = fingerprint;
  snapshots.push(snap);
  if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
  diagConsoleInfo("ezzy_pwa_cold_open", "pwacold", "[PWAColdOpen]", {
    path: snap.path || "(dashboard)",
    forceOutletFallback: snap.forceOutletFallback,
    effectiveTabPaneReady: snap.effectiveTabPaneReady,
    'isTabPageChunkLoaded("")': snap.dashboardChunkLoaded,
    dashboardChunkInFlight: snap.dashboardChunkInFlight,
    orgLoading: snap.orgLoading,
    permissionsIsFetching: snap.permissionsIsFetching,
    permissionsFetchStatus: snap.permissionsFetchStatus,
    spinnerKind: snap.spinnerKind,
    spinnerText: snap.spinnerText,
  });
  exposePwaColdOpenApi();
  return snap;
}

export function getPwaColdOpenSnapshots(): PwaColdOpenSnapshot[] {
  return [...snapshots];
}

export function latestPwaColdOpenSnapshot(): PwaColdOpenSnapshot | null {
  return snapshots[snapshots.length - 1] ?? null;
}

export function buildPwaColdOpenReport(): string {
  const chunkLines =
    chunkEvents.length === 0
      ? "(no tab-chunk start/resolve events yet)"
      : chunkEvents
          .map(
            (e) =>
              `${new Date(e.at).toISOString()} chunk ${e.path || "(dashboard)"} ${e.phase}`,
          )
          .join("\n");
  const timeline = buildPaneTimelineReport();
  if (snapshots.length === 0) {
    return `${chunkLines}\n${timeline}\n(no PWA cold-open snapshots yet)`;
  }
  const snapLines = snapshots
    .map((s) => {
      return [
        new Date(s.at).toISOString(),
        s.path || "(dashboard)",
        `forceOutletFallback=${s.forceOutletFallback}`,
        `effectiveTabPaneReady=${s.effectiveTabPaneReady}`,
        `isTabPageChunkLoaded("")=${s.dashboardChunkLoaded}`,
        `inFlight=${s.dashboardChunkInFlight}`,
        `orgLoading=${s.orgLoading}`,
        `permissions isFetching=${s.permissionsIsFetching}`,
        `fetchStatus=${s.permissionsFetchStatus}`,
        `spinner=${s.spinnerKind}`,
      ].join(" ");
    })
    .join("\n");
  return `${chunkLines}\n${timeline}\n${snapLines}`;
}

let exposed = false;
function exposePwaColdOpenApi(): void {
  if (exposed || typeof window === "undefined") return;
  exposed = true;
  (window as Window & { __ezzyColdOpen?: Record<string, unknown> }).__ezzyColdOpen = {
    get: getPwaColdOpenSnapshots,
    latest: latestPwaColdOpenSnapshot,
    chunks: getTabChunkLoadEvents,
    timeline: getPaneTimelineEvents,
    panes: buildPaneTimelineReport,
    print: () => console.log(buildPwaColdOpenReport()),
    report: buildPwaColdOpenReport,
  };
}
