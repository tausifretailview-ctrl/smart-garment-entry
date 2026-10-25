/**
 * PAYAL SHOES (2026-10-25): after a Windows reinstall the PC clock / time zone was
 * wrong, so every login token looked expired the moment it arrived. supabase-js then
 * refreshed on every request until the auth server answered 429, and the app crawled.
 *
 * The auth guard measures the skew from each token response (server issue time vs
 * this PC's clock) and records it here; ClockSkewWarning tells the shop to fix the
 * clock. Dependency-free: imported by authRefreshGuard before the Supabase client.
 */

/** Ignore normal drift and network delay. */
export const CLOCK_SKEW_TOLERANCE_SEC = 120;

const STORAGE_KEY = "ezzy_clock_skew_sec";
export const CLOCK_SKEW_EVENT = "ezzy-clock-skew";

let skewSec: number | null = null;

/** Seconds this PC's clock is ahead (+) or behind (−) the server; null when unknown. */
export function getClockSkewSec(): number | null {
  if (skewSec !== null) return skewSec;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (raw !== null && raw !== "" && Number.isFinite(Number(raw))) return Number(raw);
  } catch {
    // storage blocked
  }
  return null;
}

export function isClockSkewed(sec: number | null = getClockSkewSec()): boolean {
  return sec !== null && Math.abs(sec) > CLOCK_SKEW_TOLERANCE_SEC;
}

export function reportClockSkew(sec: number): void {
  const rounded = Math.round(sec);
  const changed = isClockSkewed(rounded) !== isClockSkewed(skewSec);
  skewSec = rounded;
  try {
    sessionStorage.setItem(STORAGE_KEY, String(rounded));
  } catch {
    // storage blocked
  }
  if (changed && typeof window !== "undefined") {
    if (isClockSkewed(rounded)) {
      console.warn(
        `[clock] This PC's clock is off by ${Math.round(rounded / 60)} min from the server — fix Windows date, time and time zone.`,
      );
    }
    window.dispatchEvent(new Event(CLOCK_SKEW_EVENT));
  }
}

/** "13 h 30 min" / "25 min" for the warning. */
export function formatClockSkew(sec: number): string {
  const totalMin = Math.round(Math.abs(sec) / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
