/**
 * Aggregation for Activity Log → Logins & screen time (user_screen_time rows
 * + audit_logs LOGIN rows).
 */
import { resolvePageTitleLabel } from "@/lib/pageTitles";

export type ScreenTimeRow = {
  id: string;
  user_id: string;
  user_email: string | null;
  app_session_id: string;
  screen: string;
  started_at: string;
  last_seen_at: string;
  active_seconds: number;
  ended_reason: string | null;
  device: string | null;
};

export type LoginRow = {
  user_id: string | null;
  user_email: string | null;
  created_at: string;
};

export type UserScreenSummary = {
  userId: string;
  email: string;
  firstSeen: string;
  lastSeen: string;
  /** Wall-clock time with at least one app tab open and visible (overlaps merged). */
  openSeconds: number;
  activeSeconds: number;
  logins: number;
  logouts: number;
  appOpens: number;
  topScreens: Array<{ screen: string; activeSeconds: number }>;
};

export type ScreenBreakdown = {
  screen: string;
  visits: number;
  openSeconds: number;
  activeSeconds: number;
};

/** A visit not ended and seen within this window is shown as "Still open". */
export const STILL_OPEN_WINDOW_MS = 7 * 60_000;

export function screenLabel(screen: string): string {
  return resolvePageTitleLabel(screen === "dashboard" ? "" : screen) || screen;
}

export function visitOpenSeconds(row: Pick<ScreenTimeRow, "started_at" | "last_seen_at">): number {
  const ms = new Date(row.last_seen_at).getTime() - new Date(row.started_at).getTime();
  return Math.max(0, Math.round(ms / 1000));
}

export function visitStatus(row: Pick<ScreenTimeRow, "ended_reason" | "last_seen_at">, nowMs = Date.now()): string {
  switch (row.ended_reason) {
    case "navigate":
      return "Moved to another screen";
    case "logout":
      return "Logged out";
    case "hidden":
      return "Left the app / minimised";
    case "closed":
      return "Closed the app";
    default:
      return nowMs - new Date(row.last_seen_at).getTime() < STILL_OPEN_WINDOW_MS ? "Still open" : "Closed the app";
  }
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

function mergedSeconds(intervals: Array<[number, number]>): number {
  if (intervals.length === 0) return 0;
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [curStart, curEnd] = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const [s, e] = sorted[i];
    if (s <= curEnd) {
      curEnd = Math.max(curEnd, e);
    } else {
      total += curEnd - curStart;
      curStart = s;
      curEnd = e;
    }
  }
  total += curEnd - curStart;
  return Math.round(total / 1000);
}

export function summarizeByUser(
  rows: ScreenTimeRow[],
  logins: LoginRow[],
  emailById: Map<string, string> = new Map(),
): UserScreenSummary[] {
  type Acc = {
    email: string;
    first: number;
    last: number;
    intervals: Array<[number, number]>;
    active: number;
    logins: number;
    logouts: number;
    sessions: Set<string>;
    screens: Map<string, number>;
  };
  const byUser = new Map<string, Acc>();
  const get = (userId: string, email: string | null): Acc => {
    let acc = byUser.get(userId);
    if (!acc) {
      acc = {
        email: email || emailById.get(userId) || "Unknown user",
        first: Infinity,
        last: -Infinity,
        intervals: [],
        active: 0,
        logins: 0,
        logouts: 0,
        sessions: new Set(),
        screens: new Map(),
      };
      byUser.set(userId, acc);
    }
    return acc;
  };

  for (const r of rows) {
    const acc = get(r.user_id, r.user_email);
    const s = new Date(r.started_at).getTime();
    const e = Math.max(s, new Date(r.last_seen_at).getTime());
    acc.first = Math.min(acc.first, s);
    acc.last = Math.max(acc.last, e);
    acc.intervals.push([s, e]);
    acc.active += r.active_seconds || 0;
    if (r.ended_reason === "logout") acc.logouts += 1;
    acc.sessions.add(r.app_session_id);
    acc.screens.set(r.screen, (acc.screens.get(r.screen) ?? 0) + (r.active_seconds || 0));
  }
  for (const l of logins) {
    if (!l.user_id) continue;
    const acc = get(l.user_id, l.user_email);
    const t = new Date(l.created_at).getTime();
    acc.first = Math.min(acc.first, t);
    acc.last = Math.max(acc.last, t);
    acc.logins += 1;
  }

  return [...byUser.entries()]
    .map(([userId, a]) => {
      const openSeconds = mergedSeconds(a.intervals);
      return {
        userId,
        email: a.email,
        firstSeen: new Date(a.first).toISOString(),
        lastSeen: new Date(a.last).toISOString(),
        openSeconds,
        activeSeconds: Math.min(a.active, openSeconds),
        logins: a.logins,
        logouts: a.logouts,
        appOpens: a.sessions.size,
        topScreens: [...a.screens.entries()]
          .filter(([, secs]) => secs > 0)
          .sort((x, y) => y[1] - x[1])
          .slice(0, 3)
          .map(([screen, activeSeconds]) => ({ screen, activeSeconds })),
      };
    })
    .sort((a, b) => b.activeSeconds - a.activeSeconds || a.email.localeCompare(b.email));
}

export function breakdownByScreen(rows: ScreenTimeRow[]): ScreenBreakdown[] {
  const map = new Map<string, ScreenBreakdown>();
  for (const r of rows) {
    const b = map.get(r.screen) ?? { screen: r.screen, visits: 0, openSeconds: 0, activeSeconds: 0 };
    b.visits += 1;
    b.openSeconds += visitOpenSeconds(r);
    b.activeSeconds += r.active_seconds || 0;
    map.set(r.screen, b);
  }
  return [...map.values()].sort((a, b) => b.activeSeconds - a.activeSeconds || b.openSeconds - a.openSeconds);
}

export type TimelineEntry =
  | { kind: "login"; at: string; email: string }
  | { kind: "visit"; at: string; email: string; row: ScreenTimeRow };

export function buildTimeline(
  rows: ScreenTimeRow[],
  logins: LoginRow[],
  emailById: Map<string, string> = new Map(),
): TimelineEntry[] {
  const out: TimelineEntry[] = [
    ...rows.map((row) => ({
      kind: "visit" as const,
      at: row.started_at,
      email: row.user_email || emailById.get(row.user_id) || "Unknown user",
      row,
    })),
    ...logins.map((l) => ({
      kind: "login" as const,
      at: l.created_at,
      email: l.user_email || (l.user_id ? emailById.get(l.user_id) : undefined) || "Unknown user",
    })),
  ];
  return out.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}
