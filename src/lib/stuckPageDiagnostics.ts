import { getInFlightRouteLoads, type InFlightRouteLoad } from "@/lib/chunkLoadRetry";
import { logError } from "@/lib/errorLogger";

/**
 * "This page is taking longer than expected to load" (OutletLoadFallback) could not be
 * reproduced on a throttled network: page files are 5–80 KB and open in under a second, or
 * ~6 s after a cold reload on 1.5 Mbps. To find what shops actually hit, each time the hint
 * shows we write ONE row to app_error_logs (operation "page_load_stalled") saying what was
 * still loading and what the PC was doing: hidden window, busy main thread, offline,
 * service-worker update, newer build on the server. Visible on Admin Health.
 */

export const STUCK_PAGE_OPERATION = "page_load_stalled";
/** Report a still-stuck page after this long even if it never loads. */
export const STUCK_PAGE_REPORT_AFTER_MS = 60_000;
const SESSION_KEY = "ezzy_stuck_page_reports";
const MAX_REPORTS_PER_SESSION = 3;

export type StuckPageOutcome = "loaded" | "left-page" | "still-loading" | "reload-pressed";

export type StuckPageWatch = {
  path: string;
  /** When the loading skeleton mounted. */
  startedAt: number;
  /** Total time the window was hidden while waiting (minimised, other app, PC asleep). */
  hiddenMs: number;
  hiddenSince: number | null;
  /** Main-thread tasks over 50 ms while waiting (PC busy / app busy). */
  longTaskCount: number;
  longTaskMs: number;
  /** Largest gap between timer ticks (a sleeping PC or frozen tab shows as a big gap). */
  maxTimerGapMs: number;
  /** Newer build found on the server when the hint appeared (null = not checked). */
  newerBuildOnServer: boolean | null;
};

export function startStuckPageWatch(path: string, now = Date.now(), hidden = false): StuckPageWatch {
  return {
    path,
    startedAt: now,
    hiddenMs: 0,
    hiddenSince: hidden ? now : null,
    longTaskCount: 0,
    longTaskMs: 0,
    maxTimerGapMs: 0,
    newerBuildOnServer: null,
  };
}

export function noteVisibility(watch: StuckPageWatch, hidden: boolean, now = Date.now()): void {
  if (hidden && watch.hiddenSince === null) watch.hiddenSince = now;
  if (!hidden && watch.hiddenSince !== null) {
    watch.hiddenMs += now - watch.hiddenSince;
    watch.hiddenSince = null;
  }
}

export function noteLongTask(watch: StuckPageWatch, durationMs: number): void {
  watch.longTaskCount += 1;
  watch.longTaskMs += Math.round(durationMs);
}

export function noteTimerGap(watch: StuckPageWatch, gapMs: number): void {
  if (gapMs > watch.maxTimerGapMs) watch.maxTimerGapMs = Math.round(gapMs);
}

type SlowAsset = { file: string; ms: number; kb: number };

/** Page files (/assets/*.js) fetched while waiting that took over 2 s. */
export function slowAssetsSince(
  startedAt: number,
  entries: Array<{ name: string; startTime: number; duration: number; transferSize?: number }>,
  timeOrigin: number,
): SlowAsset[] {
  return entries
    .filter((e) => /\/assets\/[^/?#]+\.js(?:[?#]|$)/.test(e.name) && timeOrigin + e.startTime >= startedAt - 1000 && e.duration > 2000)
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 5)
    .map((e) => ({
      file: e.name.split("/").pop()?.split("?")[0] ?? e.name,
      ms: Math.round(e.duration),
      kb: Math.round((e.transferSize ?? 0) / 1024),
    }));
}

export type StuckPageReport = {
  path: string;
  outcome: StuckPageOutcome;
  waitedMs: number;
  hiddenMs: number;
  longTaskCount: number;
  longTaskMs: number;
  maxTimerGapMs: number;
  newerBuildOnServer: boolean | null;
  pendingPageFiles: Array<Pick<InFlightRouteLoad, "chunk" | "failedAttempts" | "lastError"> & { waitedMs: number }>;
  slowPageFiles: SlowAsset[];
  online: boolean | null;
  connection: { type?: string; downlinkMbps?: number; rttMs?: number; saveData?: boolean } | null;
  serviceWorker: { controlled: boolean; controllerState: string | null };
  sinceAppStartMs: number;
  cpuCores: number | null;
  memoryGb: number | null;
};

export function buildStuckPageReport(watch: StuckPageWatch, outcome: StuckPageOutcome, now = Date.now()): StuckPageReport {
  noteVisibility(watch, false, now); // close an open hidden span
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & {
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    deviceMemory?: number;
  }) : null;
  const perf = typeof performance !== "undefined" ? performance : null;
  const resources = perf?.getEntriesByType?.("resource") as PerformanceResourceTiming[] | undefined;
  return {
    path: watch.path,
    outcome,
    waitedMs: now - watch.startedAt,
    hiddenMs: watch.hiddenMs,
    longTaskCount: watch.longTaskCount,
    longTaskMs: watch.longTaskMs,
    maxTimerGapMs: watch.maxTimerGapMs,
    newerBuildOnServer: watch.newerBuildOnServer,
    pendingPageFiles: getInFlightRouteLoads(now).map(({ chunk, failedAttempts, lastError, waitedMs }) => ({
      chunk,
      failedAttempts,
      lastError,
      waitedMs,
    })),
    slowPageFiles: resources && perf ? slowAssetsSince(watch.startedAt, resources, perf.timeOrigin) : [],
    online: nav ? nav.onLine : null,
    connection: nav?.connection
      ? {
          type: nav.connection.effectiveType,
          downlinkMbps: nav.connection.downlink,
          rttMs: nav.connection.rtt,
          saveData: nav.connection.saveData,
        }
      : null,
    serviceWorker: {
      controlled: !!nav?.serviceWorker?.controller,
      controllerState: nav?.serviceWorker?.controller?.state ?? null,
    },
    sinceAppStartMs: perf ? Math.round(perf.now()) : 0,
    cpuCores: nav?.hardwareConcurrency ?? null,
    memoryGb: nav?.deviceMemory ?? null,
  };
}

/** At most one report per page and three per browser session. */
export function claimStuckPageReport(path: string, storage: Pick<Storage, "getItem" | "setItem"> | null): boolean {
  try {
    if (!storage) return true;
    const seen: string[] = JSON.parse(storage.getItem(SESSION_KEY) || "[]");
    if (seen.includes(path) || seen.length >= MAX_REPORTS_PER_SESSION) return false;
    storage.setItem(SESSION_KEY, JSON.stringify([...seen, path]));
    return true;
  } catch {
    return true;
  }
}

const OUTCOME_TEXT: Record<StuckPageOutcome, string> = {
  loaded: "Page loaded",
  "left-page": "User left the page",
  "still-loading": "Page still loading",
  "reload-pressed": "Reload app pressed",
};

export function reportStuckPage(report: StuckPageReport, organizationId: string | null | undefined): Promise<void> {
  const seconds = Math.round(report.waitedMs / 1000);
  return logError(
    {
      operation: STUCK_PAGE_OPERATION,
      page: report.path,
      organizationId: organizationId || undefined,
      additionalContext: report,
    },
    new Error(`${OUTCOME_TEXT[report.outcome]} after ${seconds}s (slow-load hint shown)`),
  );
}
