/**
 * Screen time tracking for Activity Log → Logins & screen time.
 *
 * One row per screen visit (client-made id). The open visit grows in memory
 * and is upserted in batches (every FLUSH_MS, on tab hide and on logout), so
 * an hour of work is ~12 small RPCs, not a heartbeat write every few seconds.
 *
 * Active time = seconds the tab was visible AND the user typed / clicked /
 * scrolled / touched within the last ACTIVE_WINDOW_MS.
 */

export const SCREEN_TIME_TICK_MS = 15_000;
export const SCREEN_TIME_ACTIVE_WINDOW_MS = 60_000;
export const SCREEN_TIME_FLUSH_MS = 5 * 60_000;
/** Ticks further apart than this mean the tab slept / was hidden: start a fresh visit. */
const GAP_SPLIT_MS = SCREEN_TIME_TICK_MS * 4;
const MAX_PENDING = 200;

export type ScreenEndReason = "navigate" | "logout" | "hidden" | "closed";

export type ScreenVisitPayload = {
  id: string;
  app_session_id: string;
  screen: string;
  started_at: string;
  last_seen_at: string;
  active_seconds: number;
  ended_reason: ScreenEndReason | null;
  device: string;
};

type Visit = {
  id: string;
  screen: string;
  startedAt: number;
  lastSeenAt: number;
  activeMs: number;
  endedReason: ScreenEndReason | null;
};

export type ScreenTimeTrackerDeps = {
  send: (rows: ScreenVisitPayload[]) => Promise<void>;
  now?: () => number;
  newId?: () => string;
  device: string;
};

function defaultId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  // RFC4122 v4 fallback for old WebViews.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** "/shop/pos-sales/abc" → "pos-sales"; "" → "dashboard". */
export function screenKeyFromOrgPath(orgPathSegment: string): string {
  const first = orgPathSegment.split(/[/?#]/).filter(Boolean)[0];
  return first || "dashboard";
}

export class ScreenTimeTracker {
  private readonly send: ScreenTimeTrackerDeps["send"];
  private readonly now: () => number;
  private readonly newId: () => string;
  private readonly device: string;
  readonly appSessionId: string;

  private current: Visit | null = null;
  /** Screen that was open when the tab was hidden; reopened on resume(). */
  private pausedScreen: string | null = null;
  /** Visits with unsent changes, keyed by id. */
  private dirty = new Map<string, Visit>();
  private lastTickAt: number;
  private lastInputAt: number;
  private flushing: Promise<void> | null = null;

  constructor(deps: ScreenTimeTrackerDeps) {
    this.send = deps.send;
    this.now = deps.now ?? Date.now;
    this.newId = deps.newId ?? defaultId;
    this.device = deps.device;
    this.appSessionId = this.newId();
    this.lastTickAt = this.now();
    this.lastInputAt = this.now();
  }

  get currentScreen(): string | null {
    return this.current?.screen ?? null;
  }

  noteInput(): void {
    this.lastInputAt = this.now();
  }

  setScreen(screen: string): void {
    if (this.current?.screen === screen) return;
    const t = this.now();
    this.endCurrent("navigate", t);
    this.startVisit(screen, t);
  }

  /** Call every SCREEN_TIME_TICK_MS while the tab is visible. */
  tick(): void {
    const t = this.now();
    const gap = t - this.lastTickAt;
    this.lastTickAt = t;
    if (!this.current) return;
    if (gap > GAP_SPLIT_MS) {
      // Laptop slept / timers frozen: close the old visit where it was last seen.
      const screen = this.current.screen;
      this.endCurrent("hidden", this.current.lastSeenAt);
      this.startVisit(screen, t);
      return;
    }
    this.current.lastSeenAt = t;
    if (t - this.lastInputAt < SCREEN_TIME_ACTIVE_WINDOW_MS) {
      this.current.activeMs += Math.min(gap, SCREEN_TIME_TICK_MS * 2);
    }
    this.dirty.set(this.current.id, this.current);
  }

  /** Tab hidden: stop counting this visit; a new one starts when it shows again. */
  pause(): void {
    if (!this.current) return;
    const screen = this.current.screen;
    this.tick();
    this.endCurrent("hidden", this.current?.lastSeenAt ?? this.now());
    this.pausedScreen = screen;
  }

  resume(): void {
    this.lastTickAt = this.now();
    if (!this.current && this.pausedScreen) {
      this.startVisit(this.pausedScreen, this.now());
    }
    this.pausedScreen = null;
  }

  end(reason: ScreenEndReason): void {
    if (this.current) this.tick();
    this.endCurrent(reason, this.current?.lastSeenAt ?? this.now());
    this.pausedScreen = null;
  }

  pendingCount(): number {
    return this.dirty.size;
  }

  async flush(): Promise<void> {
    if (this.flushing) {
      await this.flushing;
    }
    if (this.dirty.size === 0) return;
    const batch = [...this.dirty.values()];
    this.dirty.clear();
    const rows = batch.map((v) => this.toPayload(v));
    this.flushing = this.send(rows)
      .catch(() => {
        // Put back what failed unless a newer change already re-queued it.
        for (const v of batch) {
          if (!this.dirty.has(v.id) && this.dirty.size < MAX_PENDING) this.dirty.set(v.id, v);
        }
      })
      .finally(() => {
        this.flushing = null;
      });
    await this.flushing;
  }

  private startVisit(screen: string, t: number): void {
    this.current = {
      id: this.newId(),
      screen,
      startedAt: t,
      lastSeenAt: t,
      activeMs: 0,
      endedReason: null,
    };
    this.lastTickAt = t;
    this.dirty.set(this.current.id, this.current);
  }

  private endCurrent(reason: ScreenEndReason, at: number): void {
    const v = this.current;
    if (!v) return;
    v.lastSeenAt = Math.max(v.startedAt, at);
    v.endedReason = reason;
    this.current = null;
    // Under a second with no activity is a click-through (menu hop); don't send it.
    if (v.lastSeenAt - v.startedAt < 1000 && v.activeMs === 0 && reason === "navigate") {
      this.dirty.delete(v.id);
      return;
    }
    this.dirty.set(v.id, v);
    if (this.dirty.size > MAX_PENDING) {
      const oldest = this.dirty.keys().next().value;
      if (oldest) this.dirty.delete(oldest);
    }
  }

  private toPayload(v: Visit): ScreenVisitPayload {
    return {
      id: v.id,
      app_session_id: this.appSessionId,
      screen: v.screen,
      started_at: new Date(v.startedAt).toISOString(),
      last_seen_at: new Date(v.lastSeenAt).toISOString(),
      active_seconds: Math.round(v.activeMs / 1000),
      ended_reason: v.endedReason,
      device: this.device,
    };
  }
}
