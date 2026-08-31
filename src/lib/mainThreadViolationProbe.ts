/**
 * Main-thread long-task / Chrome-violation probe.
 *
 * Chrome's `[Violation] 'message' handler took Xms` with no app
 * `window.onmessage` is React 18's MessageChannel scheduler
 * (`performWorkUntilDeadline`), not previewAuthStorage (Lovable preview only)
 * and not Electron `erp-navigate`. Forced reflow is a layout read after a
 * write in the same task.
 *
 * Four shop captures never flipped `forceOutletFallback`. Every capture showed
 * Forced reflow + long `message` handlers, climbing ~91ms → 532ms. This probe
 * records longtasks with `href` so a detached DevTools window on
 * `/organization-setup` is not mistaken for the visible Dashboard.
 *
 * In-memory always. Console is opt-in only:
 *   localStorage.setItem("ezzy_main_thread", "1")  or  ?mainthread=1
 * Readout (no flag needed): window.__ezzyMainThread.print()
 * Grep: [MainThread]
 *
 * Next capture: expand the Chrome violation *stack* (not just the summary
 * line) and confirm `href` matches the visible org URL before treating the
 * numbers as that window's load.
 */

import { diagConsoleInfo } from "@/lib/diagConsole";

export type MainThreadLongTask = {
  at: number;
  durationMs: number;
  startTime: number;
  name: string;
  href: string;
  title: string;
  staleDevToolsHint: boolean;
};

const MAX = 40;
const tasks: MainThreadLongTask[] = [];
const KNOWN_REFLOW_SITES = [
  "TabCachedPages.nudgePaneScrollLayout (void el.offsetHeight)",
  "tabCacheReadiness.hasPaintedWorkspaceContent (getBoundingClientRect)",
] as const;

let bootAt = 0;
let persistRestoredAt: number | null = null;
let persistCacheChars: number | null = null;
let persistRestoreMs: number | null = null;

export function resetMainThreadViolationProbeForTests(): void {
  tasks.length = 0;
  persistRestoredAt = null;
  persistCacheChars = null;
  persistRestoreMs = null;
  bootAt = 0;
}

/** True when DevTools URL is organization-setup — do not treat as Dashboard load. */
export function hrefLooksLikeStaleDevToolsTarget(href: string): boolean {
  if (!href) return false;
  try {
    const path = new URL(href, "https://app.inventoryshop.in").pathname.replace(/\/+$/, "");
    return path === "/organization-setup";
  } catch {
    return href.includes("organization-setup");
  }
}

/**
 * Chrome's `'message' handler` summary is the scheduler unless the expanded
 * stack names an app listener. Pass the stack when the shop expands it.
 */
export function classifyChromeMessageViolation(stack?: string): string {
  const s = stack ?? "";
  if (/previewAuthStorage|src\/integrations\/supabase\/previewAuthStorage/.test(s)) {
    return "app-preview-auth-message";
  }
  if (/performWorkUntilDeadline|unstable_now|MessageChannel|Scheduler/.test(s)) {
    return "react-scheduler-messagechannel";
  }
  if (!stack) return "react-scheduler-messagechannel";
  return "unknown-message-handler";
}

/** Classify an expanded Forced-reflow stack. Without a stack we cannot pick a site. */
export function classifyForcedReflowSite(stack?: string): string {
  const s = stack ?? "";
  if (/nudgePaneScrollLayout|TabCachedPages/.test(s)) return "tab-cache-nudge";
  if (/hasPaintedWorkspaceContent|tabCacheReadiness/.test(s)) return "blank-frame-watchdog";
  if (!stack) return "need-expanded-stack";
  return "unknown-layout-read";
}

export function markPersistRestoreComplete(cacheChars?: number | null): void {
  persistRestoredAt = Date.now();
  persistRestoreMs = bootAt > 0 ? persistRestoredAt - bootAt : null;
  if (cacheChars != null) persistCacheChars = cacheChars;
  diagConsoleInfo("ezzy_main_thread", "mainthread", "[MainThread]", {
    persistRestoreMs,
    persistCacheChars,
  });
  exposeMainThreadApi();
}

export function getPersistRestoreProbe(): {
  persistRestoreMs: number | null;
  persistCacheChars: number | null;
} {
  return { persistRestoreMs, persistCacheChars };
}

export function recordMainThreadLongTask(
  input: Omit<MainThreadLongTask, "at" | "staleDevToolsHint" | "title"> & {
    at?: number;
    title?: string;
    staleDevToolsHint?: boolean;
  },
): MainThreadLongTask {
  const row: MainThreadLongTask = {
    at: input.at ?? Date.now(),
    durationMs: input.durationMs,
    startTime: input.startTime,
    name: input.name,
    href: input.href,
    title: input.title ?? "",
    staleDevToolsHint:
      input.staleDevToolsHint ?? hrefLooksLikeStaleDevToolsTarget(input.href),
  };
  tasks.push(row);
  if (tasks.length > MAX) tasks.shift();
  diagConsoleInfo("ezzy_main_thread", "mainthread", "[MainThread]", {
    durationMs: Math.round(row.durationMs),
    name: row.name,
    href: row.href,
    title: row.title,
    staleDevToolsHint: row.staleDevToolsHint,
    persistRestoreMs,
    persistCacheChars,
    knownReflowSites: KNOWN_REFLOW_SITES,
  });
  exposeMainThreadApi();
  return row;
}

export function getMainThreadLongTasks(): MainThreadLongTask[] {
  return [...tasks];
}

export function buildMainThreadReport(): string {
  const persistLine = `persistRestoreMs=${persistRestoreMs ?? "pending"} persistCacheChars=${persistCacheChars ?? "n/a"}`;
  if (tasks.length === 0) return `${persistLine}\n(no longtasks recorded yet)`;
  const lines = tasks.map((t) => {
    const stale = t.staleDevToolsHint ? " STALE_DEVTOOLS_HREF" : "";
    return `${new Date(t.at).toISOString()} ${Math.round(t.durationMs)}ms name=${t.name} href=${t.href} title=${t.title}${stale}`;
  });
  return [persistLine, ...lines].join("\n");
}

let exposed = false;
function exposeMainThreadApi(): void {
  if (exposed || typeof window === "undefined") return;
  exposed = true;
  (window as Window & { __ezzyMainThread?: Record<string, unknown> }).__ezzyMainThread = {
    get: getMainThreadLongTasks,
    print: () => console.log(buildMainThreadReport()),
    report: buildMainThreadReport,
    persist: getPersistRestoreProbe,
    classifyMessage: classifyChromeMessageViolation,
    classifyReflow: classifyForcedReflowSite,
    knownReflowSites: KNOWN_REFLOW_SITES,
  };
}

/** Start observing. Safe to call twice. No-op when PerformanceObserver is missing. */
export function initMainThreadViolationProbe(): () => void {
  bootAt = Date.now();
  exposeMainThreadApi();
  if (typeof PerformanceObserver === "undefined") return () => {};
  let observer: PerformanceObserver | null = null;
  try {
    observer = new PerformanceObserver((list) => {
      const href = typeof location !== "undefined" ? location.href : "";
      const title = typeof document !== "undefined" ? document.title : "";
      for (const entry of list.getEntries()) {
        if (entry.duration < 50) continue;
        recordMainThreadLongTask({
          durationMs: entry.duration,
          startTime: entry.startTime,
          name: entry.name || entry.entryType,
          href,
          title,
        });
      }
    });
    observer.observe({ type: "longtask", buffered: true });
  } catch {
    try {
      observer?.observe({ entryTypes: ["measure"] });
    } catch {
      observer = null;
    }
  }
  return () => observer?.disconnect();
}
