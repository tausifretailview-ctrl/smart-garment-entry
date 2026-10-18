import { describe, expect, it } from "vitest";
import { SCREEN_TIME_TICK_MS, ScreenTimeTracker, screenKeyFromOrgPath, type ScreenVisitPayload } from "./screenTime";

function setup() {
  let t = Date.parse("2026-10-18T10:00:00Z");
  let n = 0;
  const sent: ScreenVisitPayload[][] = [];
  const tracker = new ScreenTimeTracker({
    send: async (rows) => {
      sent.push(rows);
    },
    now: () => t,
    newId: () => `id-${++n}`,
    device: "web",
  });
  const advance = (ms: number) => {
    t += ms;
  };
  return { tracker, sent, advance };
}

describe("screenKeyFromOrgPath", () => {
  it("keeps the first segment and defaults to dashboard", () => {
    expect(screenKeyFromOrgPath("pos-sales")).toBe("pos-sales");
    expect(screenKeyFromOrgPath("sales-invoice/123?x=1")).toBe("sales-invoice");
    expect(screenKeyFromOrgPath("")).toBe("dashboard");
  });
});

describe("ScreenTimeTracker", () => {
  it("counts active time only while there was recent input", async () => {
    const { tracker, sent, advance } = setup();
    tracker.setScreen("pos-sales");
    for (let i = 0; i < 4; i++) {
      advance(SCREEN_TIME_TICK_MS);
      tracker.tick();
    }
    // 60s of ticks; input at start falls out of the 60s window on the 4th tick.
    for (let i = 0; i < 4; i++) {
      advance(SCREEN_TIME_TICK_MS);
      tracker.tick();
    }
    await tracker.flush();
    const row = sent[0][0];
    expect(row.screen).toBe("pos-sales");
    expect(row.active_seconds).toBe(45);
    expect(Date.parse(row.last_seen_at) - Date.parse(row.started_at)).toBe(120_000);
    expect(row.ended_reason).toBeNull();
  });

  it("ends the previous visit on navigation and batches both in one send", async () => {
    const { tracker, sent, advance } = setup();
    tracker.setScreen("pos-sales");
    advance(SCREEN_TIME_TICK_MS);
    tracker.tick();
    tracker.setScreen("stock-report");
    await tracker.flush();
    expect(sent).toHaveLength(1);
    expect(sent[0].map((r) => [r.screen, r.ended_reason])).toEqual([
      ["pos-sales", "navigate"],
      ["stock-report", null],
    ]);
  });

  it("drops sub-second click-through visits", async () => {
    const { tracker, sent, advance } = setup();
    tracker.setScreen("dashboard");
    advance(SCREEN_TIME_TICK_MS);
    tracker.tick();
    await tracker.flush();
    tracker.setScreen("sales");
    advance(200);
    tracker.setScreen("pos-sales");
    await tracker.flush();
    expect(sent[1].map((r) => r.screen)).toEqual(["dashboard", "pos-sales"]);
  });

  it("splits the visit when the tab was hidden and marks logout", async () => {
    const { tracker, sent, advance } = setup();
    tracker.setScreen("pos-sales");
    advance(SCREEN_TIME_TICK_MS);
    tracker.tick();
    tracker.pause();
    advance(30 * 60_000);
    tracker.resume();
    advance(SCREEN_TIME_TICK_MS);
    tracker.tick();
    tracker.end("logout");
    await tracker.flush();
    const rows = sent[0];
    expect(rows.map((r) => [r.screen, r.ended_reason])).toEqual([
      ["pos-sales", "hidden"],
      ["pos-sales", "logout"],
    ]);
    expect(Date.parse(rows[0].last_seen_at) - Date.parse(rows[0].started_at)).toBe(SCREEN_TIME_TICK_MS);
  });

  it("re-queues rows when sending fails", async () => {
    let fail = true;
    const sent: ScreenVisitPayload[][] = [];
    const tracker = new ScreenTimeTracker({
      send: async (rows) => {
        if (fail) throw new Error("offline");
        sent.push(rows);
      },
      device: "web",
    });
    tracker.setScreen("pos-sales");
    await tracker.flush();
    expect(tracker.pendingCount()).toBe(1);
    fail = false;
    await tracker.flush();
    expect(sent[0][0].screen).toBe("pos-sales");
    expect(tracker.pendingCount()).toBe(0);
  });
});
