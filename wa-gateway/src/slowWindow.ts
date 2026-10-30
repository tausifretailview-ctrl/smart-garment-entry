/**
 * "Send slowly all day" campaigns only send inside shop hours (IST). Kept free of imports so the app's
 * test can check it against the page's copy (src/utils/bulkWhatsAppSlow.ts).
 */

/** Minutes after midnight IST, from < to (e.g. 10:00 AM to 9:00 PM = 600 to 1260). */
export interface SendWindow {
  from: number;
  to: number;
}

const IST_OFFSET_MIN = 330;
const DAY_MIN = 1440;
const mod = (a: number, b: number) => ((a % b) + b) % b;

export function parseWindow(raw: unknown): SendWindow | undefined {
  const w = raw as { from?: unknown; to?: unknown } | null | undefined;
  if (!w) return undefined;
  const from = Math.round(Number(w.from));
  const to = Math.round(Number(w.to));
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to > DAY_MIN || to - from < 60) return undefined;
  return { from, to };
}

/** `ms` itself when inside the window, otherwise when the window next opens. */
export function windowOpenAt(ms: number, w: SendWindow): number {
  const mins = Math.floor(ms / 60_000) + IST_OFFSET_MIN;
  const m = mod(mins, DAY_MIN);
  if (m >= w.from && m < w.to) return ms;
  const midnight = mins - m;
  const open = m < w.from ? midnight + w.from : midnight + DAY_MIN + w.from;
  return (open - IST_OFFSET_MIN) * 60_000;
}

/** IST day number of a moment, to count a slow campaign's messages per day. */
export function istDay(ms: number): number {
  return Math.floor((Math.floor(ms / 60_000) + IST_OFFSET_MIN) / DAY_MIN);
}

/** When the window opens on the IST day after `ms`. */
export function nextDayOpen(ms: number, w: SendWindow): number {
  return ((istDay(ms) + 1) * DAY_MIN + w.from - IST_OFFSET_MIN) * 60_000;
}

/** 10:00 AM style, IST. */
export function istTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true });
}
