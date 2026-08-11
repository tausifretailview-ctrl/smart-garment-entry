/**
 * Phase 0 — navigation / tab-switch performance diagnostics.
 *
 * Enable in the browser console or via URL:
 *   localStorage.setItem('ezzy_nav_perf', '1'); location.reload();
 *   ?navperf=1  (persists for the session)
 *
 * Inspect: window.__ezzyNavPerf.printReport()
 *          window.__ezzyNavPerf.getTransitions()
 *          window.__ezzyNavPerf.copyReport()
 */

import { isElectronShell, shouldElectronMountOnlyActiveTab } from "@/lib/electronShell";

const STORAGE_KEY = "ezzy_nav_perf";
const SESSION_FLAG_KEY = "ezzy_nav_perf_session";
const MAX_EVENTS = 200;

export type NavPerfEventType =
  | "navigation"
  | "render-path"
  | "tab-switch"
  | "chunk-load-start"
  | "chunk-load-end"
  | "component-mount"
  | "component-unmount"
  | "data-fetch-start"
  | "data-fetch-end"
  | "loading-ui"
  | "tti";

export type NavPerfEvent = {
  id: string;
  type: NavPerfEventType;
  ts: number;
  path: string;
  durationMs?: number;
  meta?: Record<string, unknown>;
};

export type NavPerfTransition = {
  id: string;
  fromPath: string;
  toPath: string;
  startedAt: number;
  endedAt?: number;
  totalMs?: number;
  renderPath?: "tab-cache" | "outlet";
  wasRemount?: boolean;
  chunkLoadMs?: number;
  dataFetchMs?: number;
  showedLoadingUi?: boolean;
  events: NavPerfEvent[];
  classification?: "instant" | "chunk" | "data-fetch" | "remount" | "mixed" | "unknown";
};

type NavPerfSnapshot = {
  enabled: boolean;
  activePath: string;
  renderPath: "tab-cache" | "outlet" | "unknown";
  mountedTabPaths: string[];
  openTabPaths: string[];
  environment: Record<string, unknown>;
};

let enabled = false;
let eventSeq = 0;
const events: NavPerfEvent[] = [];
let currentTransition: NavPerfTransition | null = null;
const completedTransitions: NavPerfTransition[] = [];
let lastPath = "";
const chunkStartByPath = new Map<string, number>();
let snapshot: NavPerfSnapshot = {
  enabled: false,
  activePath: "",
  renderPath: "unknown",
  mountedTabPaths: [],
  openTabPaths: [],
  environment: {},
};

function nextId(prefix: string): string {
  eventSeq += 1;
  return `${prefix}-${eventSeq}`;
}

function now(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function log(...args: unknown[]): void {
  if (!enabled) return;
  console.log("[NavPerf]", ...args);
}

function pushEvent(event: NavPerfEvent): void {
  if (!enabled) return;
  events.push(event);
  if (events.length > MAX_EVENTS) events.shift();
  currentTransition?.events.push(event);
  log(event.type, event.path, event.durationMs ?? "", event.meta ?? "");
}

function classifyTransition(t: NavPerfTransition): NavPerfTransition["classification"] {
  const types = new Set(t.events.map((e) => e.type));
  const hasChunk = types.has("chunk-load-start") || types.has("chunk-load-end");
  const hasData = types.has("data-fetch-start") || types.has("data-fetch-end");
  const hasRemount = types.has("component-mount");
  const hasLoadingUi = types.has("loading-ui");

  if (!hasChunk && !hasData && !hasRemount && !hasLoadingUi && (t.totalMs ?? 0) < 100) {
    return "instant";
  }
  if (hasRemount && !hasChunk && !hasData) return "remount";
  if (hasChunk && !hasData && !hasRemount) return "chunk";
  if (hasData && !hasChunk) return "data-fetch";
  if (hasChunk || hasData || hasRemount) return "mixed";
  return "unknown";
}

function finalizeTransition(): void {
  if (!currentTransition) return;
  currentTransition.endedAt = now();
  currentTransition.totalMs = currentTransition.endedAt - currentTransition.startedAt;
  currentTransition.chunkLoadMs = sumDuration(currentTransition.events, "chunk-load-end");
  currentTransition.dataFetchMs = sumDuration(currentTransition.events, "data-fetch-end");
  currentTransition.showedLoadingUi = currentTransition.events.some((e) => e.type === "loading-ui");
  currentTransition.wasRemount = currentTransition.events.some((e) => e.type === "component-mount");
  currentTransition.classification = classifyTransition(currentTransition);
  completedTransitions.push(currentTransition);
  if (completedTransitions.length > 50) completedTransitions.shift();
  log(
    "transition complete",
    `${currentTransition.fromPath} → ${currentTransition.toPath}`,
    `${Math.round(currentTransition.totalMs)}ms`,
    currentTransition.classification,
  );
  currentTransition = null;
}

function sumDuration(evts: NavPerfEvent[], endType: NavPerfEventType): number | undefined {
  const total = evts
    .filter((e) => e.type === endType && typeof e.durationMs === "number")
    .reduce((sum, e) => sum + (e.durationMs ?? 0), 0);
  return total > 0 ? total : undefined;
}

function startTransition(fromPath: string, toPath: string): void {
  if (!enabled) return;
  if (fromPath === toPath) return;
  finalizeTransition();
  currentTransition = {
    id: nextId("transition"),
    fromPath,
    toPath,
    startedAt: now(),
    events: [],
  };
}

export function isNavigationPerfEnabled(): boolean {
  return enabled;
}

export function initNavigationPerfDiagnostics(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("navperf") === "1") {
      sessionStorage.setItem(SESSION_FLAG_KEY, "1");
      localStorage.setItem(STORAGE_KEY, "1");
    }
    enabled =
      localStorage.getItem(STORAGE_KEY) === "1" ||
      sessionStorage.getItem(SESSION_FLAG_KEY) === "1";
  } catch {
    enabled = false;
  }

  snapshot.enabled = enabled;
  snapshot.environment = {
    isElectron: isElectronShell(),
    electronSingleTab: shouldElectronMountOnlyActiveTab(),
    userAgent: navigator.userAgent,
    effectiveType: (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
      ?.effectiveType,
  };

  if (enabled) {
    log("enabled — use window.__ezzyNavPerf.printReport()");
    exposeApi();
  }

  return enabled;
}

export function setNavigationPerfEnabled(next: boolean): void {
  enabled = next;
  snapshot.enabled = next;
  try {
    if (next) {
      localStorage.setItem(STORAGE_KEY, "1");
      sessionStorage.setItem(SESSION_FLAG_KEY, "1");
    } else {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(SESSION_FLAG_KEY);
    }
  } catch {
    // ignore
  }
  if (next) exposeApi();
}

export function recordNavigation(toPath: string, meta?: Record<string, unknown>): void {
  if (!enabled) return;
  const fromPath = lastPath;
  lastPath = toPath;
  snapshot.activePath = toPath;
  startTransition(fromPath, toPath);
  pushEvent({
    id: nextId("nav"),
    type: "navigation",
    ts: now(),
    path: toPath,
    meta: { fromPath, ...meta },
  });
}

export function recordRenderPath(
  path: string,
  renderPath: "tab-cache" | "outlet",
  meta?: Record<string, unknown>,
): void {
  if (!enabled) return;
  snapshot.renderPath = renderPath;
  if (currentTransition) currentTransition.renderPath = renderPath;
  pushEvent({
    id: nextId("render"),
    type: "render-path",
    ts: now(),
    path,
    meta: { renderPath, ...meta },
  });
}

export function recordTabSwitch(
  toPath: string,
  meta?: Record<string, unknown>,
): void {
  if (!enabled) return;
  pushEvent({
    id: nextId("tab"),
    type: "tab-switch",
    ts: now(),
    path: toPath,
    meta,
  });
  window.setTimeout(() => finalizeTransition(), 3000);
}

export function recordTabCacheSnapshot(meta: {
  activePath: string;
  mountedTabPaths: string[];
  openTabPaths: string[];
}): void {
  if (!enabled) return;
  snapshot.activePath = meta.activePath;
  snapshot.mountedTabPaths = meta.mountedTabPaths;
  snapshot.openTabPaths = meta.openTabPaths;
}

/* ------------------------------------------------------------------ *
 * Render-owner decisions (always on — field evidence for blank pages)
 *
 * Unlike the perf events above these are recorded even when NavPerf is
 * disabled: the blank-page reports we get from shops (e.g. the five-tab
 * SM HAIR REPLACEMENT Electron case, stuck on Settings / User Rights with
 * both the 8s soft hint and the hard timeout) arrive after the fact, so the
 * evidence has to already be in memory when the user is asked to read it out.
 *
 * Readout: window.__ezzyRenderOwner.print()
 * ------------------------------------------------------------------ */

export type RenderOwner = "tab-cache" | "outlet";

export type RenderOwnerDecision = {
  at: number;
  path: string;
  owner: RenderOwner;
  wantsTabCache: boolean;
  effectiveTabPaneReady: boolean;
  showTabCacheDuringColdNav: boolean;
  forceOutletFallback: boolean;
  isCacheableEntryActive: boolean;
  activeChunkLoaded: boolean;
  paneMounted: boolean;
  tabPaths: string[];
  /** Set by the blank-frame watchdog when nothing painted for this decision. */
  blankFrame?: boolean;
  /** Watchdog switched the owner to <Outlet> to recover. */
  rescued?: boolean;
};

const MAX_RENDER_OWNER_DECISIONS = 30;
const renderOwnerDecisions: RenderOwnerDecision[] = [];

export function recordRenderOwnerDecision(
  decision: Omit<RenderOwnerDecision, "at">,
): void {
  const last = renderOwnerDecisions[renderOwnerDecisions.length - 1];
  if (
    last &&
    last.path === decision.path &&
    last.owner === decision.owner &&
    last.forceOutletFallback === decision.forceOutletFallback &&
    last.effectiveTabPaneReady === decision.effectiveTabPaneReady
  ) {
    return;
  }
  renderOwnerDecisions.push({ at: Date.now(), ...decision });
  if (renderOwnerDecisions.length > MAX_RENDER_OWNER_DECISIONS) {
    renderOwnerDecisions.shift();
  }
  exposeRenderOwnerApi();
}

/** Watchdog found an empty workspace container for the current decision. */
export function recordBlankFrame(path: string, rescued: boolean): void {
  const last = renderOwnerDecisions[renderOwnerDecisions.length - 1];
  if (last && last.path === path) {
    last.blankFrame = true;
    last.rescued = rescued;
  }
  console.warn(
    `[RenderOwner] Blank workspace detected for "${path || "dashboard"}" — ` +
      (rescued ? "falling back to <Outlet>." : "no owner change possible."),
    last ?? {},
  );
}

export function getRenderOwnerDecisions(): RenderOwnerDecision[] {
  return [...renderOwnerDecisions];
}

export function buildRenderOwnerReport(): string {
  if (renderOwnerDecisions.length === 0) return "(no render-owner decisions recorded yet)";
  return renderOwnerDecisions
    .map((d) => {
      const flags = [
        d.wantsTabCache ? "wantsCache" : "",
        d.effectiveTabPaneReady ? "paneReady" : "",
        d.showTabCacheDuringColdNav ? "coldNavCache" : "",
        d.forceOutletFallback ? "forcedOutlet" : "",
        d.isCacheableEntryActive ? "entryPane" : "",
        d.activeChunkLoaded ? "chunkLoaded" : "",
        d.paneMounted ? "paneMounted" : "",
        d.blankFrame ? "BLANK" : "",
        d.rescued ? "RESCUED" : "",
      ].filter(Boolean);
      return `${new Date(d.at).toISOString()} ${d.path || "(dashboard)"} → ${d.owner} [${flags.join(" ")}] tabs=${d.tabPaths.length}`;
    })
    .join("\n");
}

let renderOwnerApiExposed = false;
function exposeRenderOwnerApi(): void {
  if (renderOwnerApiExposed || typeof window === "undefined") return;
  renderOwnerApiExposed = true;
  (window as Window & { __ezzyRenderOwner?: Record<string, unknown> }).__ezzyRenderOwner = {
    get: getRenderOwnerDecisions,
    print: () => console.log(buildRenderOwnerReport()),
    report: buildRenderOwnerReport,
  };
}

export function recordChunkLoadStart(path: string): void {
  if (!enabled) return;
  const ts = now();
  chunkStartByPath.set(path, ts);
  pushEvent({
    id: nextId("chunk-start"),
    type: "chunk-load-start",
    ts,
    path,
  });
}

export function recordChunkLoadEnd(path: string, startedAt?: number): void {
  if (!enabled) return;
  const end = now();
  const fromMap = chunkStartByPath.get(path);
  chunkStartByPath.delete(path);
  const start = startedAt ?? fromMap;
  pushEvent({
    id: nextId("chunk-end"),
    type: "chunk-load-end",
    ts: end,
    path,
    durationMs: start != null ? end - start : undefined,
  });
}

export function recordComponentMount(path: string, meta?: Record<string, unknown>): void {
  if (!enabled) return;
  pushEvent({
    id: nextId("mount"),
    type: "component-mount",
    ts: now(),
    path,
    meta,
  });
}

export function recordComponentUnmount(path: string): void {
  if (!enabled) return;
  pushEvent({
    id: nextId("unmount"),
    type: "component-unmount",
    ts: now(),
    path,
  });
}

export function recordDataFetchStart(label: string, path: string, meta?: Record<string, unknown>): void {
  if (!enabled) return;
  pushEvent({
    id: nextId("fetch-start"),
    type: "data-fetch-start",
    ts: now(),
    path,
    meta: { label, ...meta },
  });
}

export function recordDataFetchEnd(
  label: string,
  path: string,
  durationMs: number,
  meta?: Record<string, unknown>,
): void {
  if (!enabled) return;
  pushEvent({
    id: nextId("fetch-end"),
    type: "data-fetch-end",
    ts: now(),
    path,
    durationMs,
    meta: { label, ...meta },
  });
}

export function recordLoadingUi(path: string, kind: string, meta?: Record<string, unknown>): void {
  if (!enabled) return;
  pushEvent({
    id: nextId("loading-ui"),
    type: "loading-ui",
    ts: now(),
    path,
    meta: { kind, ...meta },
  });
}

export function recordTimeToInteractive(path: string, durationMs: number, meta?: Record<string, unknown>): void {
  if (!enabled) return;
  pushEvent({
    id: nextId("tti"),
    type: "tti",
    ts: now(),
    path,
    durationMs,
    meta,
  });
  finalizeTransition();
}

export function getNavPerfEvents(): NavPerfEvent[] {
  return [...events];
}

export function getNavPerfTransitions(): NavPerfTransition[] {
  return [...completedTransitions];
}

export function getNavPerfSnapshot(): NavPerfSnapshot {
  return { ...snapshot, mountedTabPaths: [...snapshot.mountedTabPaths], openTabPaths: [...snapshot.openTabPaths] };
}

export function buildNavPerfReport(): string {
  const lines: string[] = [
    "=== EzzyERP Navigation Perf Report (Phase 0) ===",
    `Generated: ${new Date().toISOString()}`,
    "",
    "Environment:",
    `  electron: ${snapshot.environment.isElectron}`,
    `  electronSingleTab: ${snapshot.environment.electronSingleTab}`,
    `  connection: ${snapshot.environment.effectiveType ?? "unknown"}`,
    "",
    "Current snapshot:",
    `  activePath: ${snapshot.activePath || "(none)"}`,
    `  renderPath: ${snapshot.renderPath}`,
    `  mountedTabs: ${snapshot.mountedTabPaths.join(", ") || "(none)"}`,
    `  openTabs: ${snapshot.openTabPaths.join(", ") || "(none)"}`,
    "",
    "Recent transitions:",
  ];

  const transitions = getNavPerfTransitions().slice(-10);
  if (transitions.length === 0) {
    lines.push("  (none yet — switch between dashboards)");
  } else {
    for (const t of transitions) {
      lines.push(
        `  ${t.fromPath || "(start)"} → ${t.toPath}: ${Math.round(t.totalMs ?? 0)}ms [${t.classification}]` +
          ` | render=${t.renderPath ?? "?"} chunk=${t.chunkLoadMs ?? 0}ms data=${t.dataFetchMs ?? 0}ms` +
          ` remount=${t.wasRemount ? "yes" : "no"} loadingUi=${t.showedLoadingUi ? "yes" : "no"}`,
      );
      for (const e of t.events) {
        if (e.type === "data-fetch-end" || e.type === "chunk-load-end" || e.type === "loading-ui") {
          const label = e.meta?.label ?? e.meta?.kind ?? "";
          lines.push(`    - ${e.type} ${e.path} ${label} ${e.durationMs ? `${Math.round(e.durationMs)}ms` : ""}`);
        }
      }
    }
  }

  lines.push("", "Raw events (last 30):");
  for (const e of getNavPerfEvents().slice(-30)) {
    const label = e.meta?.label ?? e.meta?.kind ?? e.meta?.renderPath ?? "";
    lines.push(
      `  ${e.type} @${Math.round(e.ts)} path=${e.path} ${label} ${e.durationMs ? `${Math.round(e.durationMs)}ms` : ""}`,
    );
  }

  return lines.join("\n");
}

export function printNavPerfReport(): void {
  console.log(buildNavPerfReport());
}

export async function copyNavPerfReport(): Promise<void> {
  const text = buildNavPerfReport();
  try {
    await navigator.clipboard.writeText(text);
    log("report copied to clipboard");
  } catch {
    console.log(text);
  }
}

function exposeApi(): void {
  (window as Window & { __ezzyNavPerf?: Record<string, unknown> }).__ezzyNavPerf = {
    enabled: () => enabled,
    enable: () => setNavigationPerfEnabled(true),
    disable: () => setNavigationPerfEnabled(false),
    getEvents: getNavPerfEvents,
    getTransitions: getNavPerfTransitions,
    getSnapshot: getNavPerfSnapshot,
    printReport: printNavPerfReport,
    copyReport: copyNavPerfReport,
    buildReport: buildNavPerfReport,
  };
}
