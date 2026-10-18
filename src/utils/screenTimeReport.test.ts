import { describe, expect, it } from "vitest";
import { buildTimeline, formatDuration, summarizeByUser, visitStatus, type ScreenTimeRow } from "./screenTimeReport";

const row = (over: Partial<ScreenTimeRow>): ScreenTimeRow => ({
  id: "r",
  user_id: "u1",
  user_email: "cashier@shop.in",
  app_session_id: "s1",
  screen: "pos-sales",
  started_at: "2026-10-18T10:00:00.000Z",
  last_seen_at: "2026-10-18T10:10:00.000Z",
  active_seconds: 300,
  ended_reason: "navigate",
  device: "web",
  ...over,
});

describe("summarizeByUser", () => {
  it("merges overlapping tabs for open time and counts logins / logouts", () => {
    const rows = [
      row({ id: "a" }),
      // Second tab overlapping 10:05–10:20.
      row({
        id: "b",
        app_session_id: "s2",
        screen: "stock-report",
        started_at: "2026-10-18T10:05:00.000Z",
        last_seen_at: "2026-10-18T10:20:00.000Z",
        active_seconds: 120,
        ended_reason: "logout",
      }),
    ];
    const [s] = summarizeByUser(rows, [
      { user_id: "u1", user_email: "cashier@shop.in", created_at: "2026-10-18T09:59:00.000Z" },
    ]);
    expect(s.openSeconds).toBe(20 * 60);
    expect(s.activeSeconds).toBe(420);
    expect(s.logins).toBe(1);
    expect(s.logouts).toBe(1);
    expect(s.appOpens).toBe(2);
    expect(s.firstSeen).toBe("2026-10-18T09:59:00.000Z");
    expect(s.topScreens[0]).toEqual({ screen: "pos-sales", activeSeconds: 300 });
  });
});

describe("visitStatus", () => {
  it("shows Still open only for recent unfinished visits", () => {
    const now = Date.parse("2026-10-18T10:12:00.000Z");
    expect(visitStatus({ ended_reason: null, last_seen_at: "2026-10-18T10:10:00.000Z" }, now)).toBe("Still open");
    expect(visitStatus({ ended_reason: null, last_seen_at: "2026-10-18T09:00:00.000Z" }, now)).toBe("Closed the app");
    expect(visitStatus({ ended_reason: "logout", last_seen_at: "2026-10-18T10:10:00.000Z" }, now)).toBe("Logged out");
  });
});

describe("formatDuration / buildTimeline", () => {
  it("formats and orders newest first", () => {
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(125)).toBe("2m 05s");
    expect(formatDuration(3900)).toBe("1h 05m");
    const t = buildTimeline([row({})], [{ user_id: "u1", user_email: null, created_at: "2026-10-18T09:59:00+00:00" }]);
    expect(t.map((e) => e.kind)).toEqual(["visit", "login"]);
  });
});
