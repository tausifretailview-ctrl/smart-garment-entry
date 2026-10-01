/**
 * Where does a POS save spend its time? Records how long each awaited step took,
 * in memory only (no console output, no network, a few microseconds per mark).
 *
 * After a slow save, in the browser console:
 *   window.__ezzyPosSave.print()   // table of the last save, slowest step flagged
 *   window.__ezzyPosSave.json()    // same as text, to paste into a message
 */

type Step = { step: string; ms: number; totalMs: number };
type Run = { label: string; startedAt: string; steps: Step[] };

const MAX_RUNS = 5;
const runs: Run[] = [];
let startMs = 0;
let lastMs = 0;
let current: Run | null = null;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

export function posSaveBegin(label: string): void {
  startMs = lastMs = now();
  current = { label, startedAt: new Date().toISOString(), steps: [] };
  runs.push(current);
  if (runs.length > MAX_RUNS) runs.shift();
}

/** Call right after an awaited step finishes; records the time since the previous mark. */
export function posSaveMark(step: string): void {
  if (!current) return;
  const t = now();
  // Marks from other flows that reuse the same helpers long after the save are not part of it.
  if (t - startMs > 120_000) return;
  current.steps.push({ step, ms: Math.round(t - lastMs), totalMs: Math.round(t - startMs) });
  lastMs = t;
}

function lastRun(): Run | null {
  return runs.length ? runs[runs.length - 1] : null;
}

/**
 * What the browser itself recorded for database requests made since the save started.
 * Fast requests but slow steps => the page was busy (main thread); slow requests => server/network.
 */
export function posSaveRequestSummary(sinceMs: number = startMs): string {
  if (typeof performance === "undefined" || typeof performance.getEntriesByType !== "function") return "";
  const entries = performance
    .getEntriesByType("resource")
    .filter((e) => e.startTime >= sinceMs && /supabase\.co\/(rest|auth|functions|rpc)/.test(e.name));
  if (!entries.length) return "Requests: none recorded.";
  const durations = entries.map((e) => Math.round(e.duration));
  const total = durations.reduce((a, b) => a + b, 0);
  const longest = entries.reduce((a, b) => (b.duration > a.duration ? b : a));
  let path = longest.name;
  try {
    path = new URL(longest.name).pathname;
  } catch {
    /* keep full name */
  }
  return (
    `Requests: ${entries.length} database calls, time on the wire ${total} ms total ` +
    `(average ${Math.round(total / entries.length)} ms, longest ${Math.round(longest.duration)} ms: ${path})`
  );
}

export function posSaveReport(run: Run | null = lastRun()): string {
  if (!run) return "No POS save recorded yet.";
  const slowest = run.steps.reduce<Step | null>((a, s) => (!a || s.ms > a.ms ? s : a), null);
  const lines = run.steps.map(
    (s) => `${s.step.padEnd(22)} ${String(s.ms).padStart(6)} ms   (total ${s.totalMs} ms)${s === slowest ? "   <-- slowest" : ""}`,
  );
  const requests = run === lastRun() ? posSaveRequestSummary() : "";
  return [`POS save: ${run.label} @ ${run.startedAt}`, ...lines, ...(requests ? [requests] : [])].join("\n");
}

if (typeof window !== "undefined") {
  try {
    // Default buffer is 250 entries; a busy session fills it before the save is measured.
    performance.setResourceTimingBufferSize?.(1000);
  } catch {
    /* ignore */
  }
  (window as Window & { __ezzyPosSave?: Record<string, unknown> }).__ezzyPosSave = {
    print: () => {
      // eslint-disable-next-line no-console
      console.info(posSaveReport());
    },
    json: () => JSON.stringify(runs),
    reset: () => {
      runs.length = 0;
      current = null;
    },
  };
}
