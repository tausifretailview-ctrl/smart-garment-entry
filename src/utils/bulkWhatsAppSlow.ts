/**
 * "Send slowly all day": a campaign spread over shop hours with gaps of several minutes, so a number does
 * not look like a bulk sender. The WhatsApp server keeps to the same hours (wa-gateway/src/slowWindow.ts,
 * same math; the test checks the two agree).
 */

/** Minutes after midnight IST, from < to. */
export interface SendWindow {
  from: number;
  to: number;
}

/** 10:00 AM to 9:00 PM. */
export const SLOW_DEFAULT_WINDOW: SendWindow = { from: 10 * 60, to: 21 * 60 };
/** Same limits as the bulk-whatsapp function. */
export const SLOW_MIN_GAP_MS = 60_000;
export const SLOW_MAX_GAP_MS = 2 * 60 * 60 * 1000;
/** Fewer hours than this left today: start tomorrow morning by default. */
const SHORT_DAY_MS = 2 * 60 * 60 * 1000;

const IST_OFFSET_MIN = 330;
const DAY_MIN = 1440;
const mod = (a: number, b: number) => ((a % b) + b) % b;

/** `ms` itself when inside the window, otherwise when the window next opens. */
export function windowOpenAt(ms: number, w: SendWindow): number {
  const mins = Math.floor(ms / 60_000) + IST_OFFSET_MIN;
  const m = mod(mins, DAY_MIN);
  if (m >= w.from && m < w.to) return ms;
  const midnight = mins - m;
  const open = m < w.from ? midnight + w.from : midnight + DAY_MIN + w.from;
  return (open - IST_OFFSET_MIN) * 60_000;
}

/** IST day number of a moment (to count days). */
const istDay = (ms: number) => Math.floor((Math.floor(ms / 60_000) + IST_OFFSET_MIN) / DAY_MIN);

/** When the window closes on the IST day of `ms`. */
function closesOn(ms: number, w: SendWindow): number {
  return (istDay(ms) * DAY_MIN + w.to - IST_OFFSET_MIN) * 60_000;
}

/** "10:00" ↔ 600. */
export function timeToMinutes(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim());
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins <= DAY_MIN ? mins : null;
}

export function minutesToTime(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
}

export function windowOk(w: SendWindow): boolean {
  return w.from >= 0 && w.to <= DAY_MIN && w.to - w.from >= 60;
}

/** Start tomorrow when today's hours are over or nearly over. */
export function slowStartsTomorrowByDefault(now: number, w: SendWindow): boolean {
  const open = windowOpenAt(now, w);
  return open > now || closesOn(now, w) - now < SHORT_DAY_MS;
}

export interface SlowPlan {
  /** Null = start now. */
  startAt: number | null;
  /** Average gap between two messages. */
  gapMs: number;
  /** About when the last message goes. */
  finishAt: number;
  /** IST days it runs on (more than 1 when the numbers do not fit in one day's hours). */
  days: number;
}

/**
 * Spreads `count` messages evenly over the hours left on the start day. Gaps stay between 1 minute and
 * 2 hours, so a long list carries on into the next days' hours.
 */
export function planSlowSend(count: number, now: number, w: SendWindow, tomorrow: boolean): SlowPlan {
  let start = windowOpenAt(now, w);
  if (tomorrow && istDay(start) === istDay(now)) {
    start = ((istDay(now) + 1) * DAY_MIN + w.from - IST_OFFSET_MIN) * 60_000;
  }
  const span = closesOn(start, w) - start;
  const gapMs = Math.min(SLOW_MAX_GAP_MS, Math.max(SLOW_MIN_GAP_MS, Math.floor(span / Math.max(1, count))));
  let t = start;
  for (let i = 1; i < count; i++) t = windowOpenAt(t + gapMs, w);
  return {
    startAt: start - now > 60_000 ? start : null,
    gapMs,
    finishAt: t,
    days: istDay(t) - istDay(start) + 1,
  };
}
