/**
 * PWA cold-open blank Dashboard — stuck-frame probe.
 *
 * Evidence only. Does not change render owner, prefetch, or rescue timers.
 * Readout: window.__ezzyColdOpen.print()
 * Grep: [PWAColdOpen]
 *
 * `forceOutletFallback === false` on four shop captures does not mean the page
 * felt fine. Chrome `[Violation] 'message' handler took Nms` is a separate
 * mechanism — see `mainThreadViolationProbe.ts`.
 */

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
  orgLoading: boolean;
  permissionsIsFetching: boolean | null;
  permissionsFetchStatus: string | null;
  spinnerKind: PwaSpinnerKind;
  spinnerText: string;
};

const MAX_SNAPSHOTS = 40;
const snapshots: PwaColdOpenSnapshot[] = [];
let lastFingerprint = "";

export function resetPwaColdOpenDiagnosticsForTests(): void {
  snapshots.length = 0;
  lastFingerprint = "";
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
  input: Omit<PwaColdOpenSnapshot, "at"> & { at?: number },
): PwaColdOpenSnapshot {
  const snap: PwaColdOpenSnapshot = {
    at: input.at ?? Date.now(),
    path: input.path,
    forceOutletFallback: input.forceOutletFallback,
    effectiveTabPaneReady: input.effectiveTabPaneReady,
    dashboardChunkLoaded: input.dashboardChunkLoaded,
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
    snap.orgLoading,
    snap.permissionsIsFetching,
    snap.permissionsFetchStatus,
    snap.spinnerKind,
  ].join("|");
  if (fingerprint === lastFingerprint) return snap;
  lastFingerprint = fingerprint;
  snapshots.push(snap);
  if (snapshots.length > MAX_SNAPSHOTS) snapshots.shift();
  console.info("[PWAColdOpen]", {
    path: snap.path || "(dashboard)",
    forceOutletFallback: snap.forceOutletFallback,
    effectiveTabPaneReady: snap.effectiveTabPaneReady,
    "isTabPageChunkLoaded(\"\")": snap.dashboardChunkLoaded,
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
  if (snapshots.length === 0) return "(no PWA cold-open snapshots yet)";
  return snapshots
    .map((s) => {
      return [
        new Date(s.at).toISOString(),
        s.path || "(dashboard)",
        `forceOutletFallback=${s.forceOutletFallback}`,
        `effectiveTabPaneReady=${s.effectiveTabPaneReady}`,
        `isTabPageChunkLoaded("")=${s.dashboardChunkLoaded}`,
        `orgLoading=${s.orgLoading}`,
        `permissions isFetching=${s.permissionsIsFetching}`,
        `fetchStatus=${s.permissionsFetchStatus}`,
        `spinner=${s.spinnerKind}`,
      ].join(" ");
    })
    .join("\n");
}

let exposed = false;
function exposePwaColdOpenApi(): void {
  if (exposed || typeof window === "undefined") return;
  exposed = true;
  (window as Window & { __ezzyColdOpen?: Record<string, unknown> }).__ezzyColdOpen = {
    get: getPwaColdOpenSnapshots,
    latest: latestPwaColdOpenSnapshot,
    print: () => console.log(buildPwaColdOpenReport()),
    report: buildPwaColdOpenReport,
  };
}
