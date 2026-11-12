/**
 * Always-on timing of the two waits shops feel most, sent to the server in small
 * batches (record_app_timings) so slow shops show up without anyone switching on a
 * flag on their PC:
 *   - screen_open: how long an "Opening …" wait lasted while a screen's code downloaded.
 *     Screens already downloaded open with no wait and record nothing.
 *   - bill_save: from pressing save to the bill being ready to print (POS, purchase).
 * In memory only until sent; no console output (POS hot path).
 */

export type AppTimingMetric = "screen_open" | "bill_save";

export type AppTimingSample = {
  metric: AppTimingMetric;
  screen: string;
  ms: number;
  at: string;
  detail?: Record<string, unknown>;
  device?: string;
};

export const APP_TIMING_MAX_BUFFER = 100;
/** A wait longer than this is a PC asleep or a tab left loading, not a real open/save. */
export const APP_TIMING_MAX_MS = 600_000;

type Sender = (rows: AppTimingSample[]) => Promise<void>;

const buffer: AppTimingSample[] = [];
let sender: Sender | null = null;
let device = "web";
let flushing = false;

const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());
const isHidden = () => typeof document !== "undefined" && document.visibilityState === "hidden";

export function recordAppTiming(
  metric: AppTimingMetric,
  screen: string,
  ms: number,
  detail?: Record<string, unknown>,
): void {
  if (!screen || !Number.isFinite(ms) || ms < 0 || ms > APP_TIMING_MAX_MS) return;
  buffer.push({ metric, screen, ms: Math.round(ms), at: new Date().toISOString(), detail, device });
  if (buffer.length > APP_TIMING_MAX_BUFFER) buffer.shift();
}

/** Set by the screen-time hook once the shop and user are known; null on sign-out. */
export function setAppTimingSender(next: Sender | null, nextDevice?: string): void {
  sender = next;
  if (nextDevice) device = nextDevice;
}

/** Clear the sender only if it is still this one, so a newer shop/user session is kept. */
export function clearAppTimingSender(owner: Sender): void {
  if (sender === owner) sender = null;
}

export async function flushAppTimings(): Promise<void> {
  if (!sender || flushing || buffer.length === 0) return;
  flushing = true;
  const rows = buffer.splice(0, APP_TIMING_MAX_BUFFER);
  try {
    await sender(rows);
  } catch {
    // Keep them for the next try, newest first if the buffer filled meanwhile.
    buffer.unshift(...rows.slice(-(APP_TIMING_MAX_BUFFER - buffer.length)));
  } finally {
    flushing = false;
  }
}

/** Screen key without the shop slug: "/ks-footwear/pos-sales" and "pos-sales" → "pos-sales". */
export function appTimingScreenKey(path: string): string {
  const parts = String(path || "").split("?")[0].split("/").filter(Boolean);
  return (parts.length > 1 ? parts.slice(1) : parts).join("/") || "home";
}

/* --- screen open ("Opening POS…") ------------------------------------------ */

const openStarts = new Map<string, { start: number; hiddenSeen: boolean }>();

export function noteScreenOpenStart(path: string): void {
  if (openStarts.has(path)) return;
  openStarts.set(path, { start: now(), hiddenSeen: isHidden() });
}

/** A background tab's downloads are throttled, so its wait says nothing about speed. */
export function noteScreenOpenHidden(): void {
  for (const entry of openStarts.values()) entry.hiddenSeen = true;
}

export function noteScreenOpenEnd(path: string): void {
  const entry = openStarts.get(path);
  if (!entry) return;
  openStarts.delete(path);
  if (entry.hiddenSeen || isHidden()) return;
  recordAppTiming("screen_open", appTimingScreenKey(path), now() - entry.start);
}

/* --- bill save ------------------------------------------------------------- */

/** posSaveTiming labels → the screen and how it was paid. */
export function billSaveScreen(label: string): { screen: string; method?: string } {
  if (label.startsWith("purchase")) return { screen: "purchase" };
  if (label.startsWith("cash-path:")) return { screen: "pos", method: label.slice("cash-path:".length) };
  if (label.startsWith("mix-path")) return { screen: "pos", method: "mix" };
  return { screen: label || "unknown" };
}

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (isHidden()) noteScreenOpenHidden();
  });
}

/** Seconds with one decimal for the admin table: 840 → "0.8 s", 12_400 → "12.4 s". */
export function formatTimingSeconds(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(Number(ms))) return "—";
  return `${(Number(ms) / 1000).toFixed(1)} s`;
}

/** Above these the wait is worth looking at: a bill save over 3 s, a screen open over 5 s. */
export function isSlowTiming(metric: string, ms: number | null | undefined): boolean {
  if (ms == null) return false;
  return metric === "bill_save" ? ms > 3000 : ms > 5000;
}
