import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_TIMING_MAX_BUFFER,
  appTimingScreenKey,
  billSaveScreen,
  clearAppTimingSender,
  flushAppTimings,
  noteScreenOpenEnd,
  noteScreenOpenHidden,
  noteScreenOpenStart,
  recordAppTiming,
  setAppTimingSender,
  type AppTimingSample,
} from "./appTiming";

let sent: AppTimingSample[][] = [];
const okSender = async (rows: AppTimingSample[]) => {
  sent.push(rows);
};

beforeEach(async () => {
  // Drain anything a previous test left behind.
  setAppTimingSender(async () => undefined);
  await flushAppTimings();
  sent = [];
  setAppTimingSender(okSender, "web");
});

afterEach(() => {
  vi.useRealTimers();
});

describe("app timings", () => {
  it("names screens without the shop slug and maps save labels", () => {
    expect(appTimingScreenKey("/ks-footwear/pos-sales")).toBe("pos-sales");
    expect(appTimingScreenKey("pos-sales")).toBe("pos-sales");
    expect(appTimingScreenKey("/shop/accounts/ledger?x=1")).toBe("accounts/ledger");
    expect(billSaveScreen("cash-path:upi")).toEqual({ screen: "pos", method: "upi" });
    expect(billSaveScreen("mix-path")).toEqual({ screen: "pos", method: "mix" });
    expect(billSaveScreen("purchase-save")).toEqual({ screen: "purchase" });
  });

  it("drops impossible values and keeps at most the buffer size", async () => {
    recordAppTiming("bill_save", "pos", -5);
    recordAppTiming("bill_save", "pos", Number.NaN);
    recordAppTiming("bill_save", "pos", 700_000);
    for (let i = 0; i < APP_TIMING_MAX_BUFFER + 20; i += 1) recordAppTiming("bill_save", "pos", i);
    await flushAppTimings();
    expect(sent).toHaveLength(1);
    expect(sent[0]).toHaveLength(APP_TIMING_MAX_BUFFER);
    expect(sent[0][0].ms).toBe(20);
    expect(sent[0][0].device).toBe("web");
  });

  it("keeps samples for the next try when sending fails", async () => {
    recordAppTiming("bill_save", "pos", 1200);
    setAppTimingSender(async () => {
      throw new Error("offline");
    });
    await flushAppTimings();
    setAppTimingSender(okSender);
    await flushAppTimings();
    expect(sent.flat().map((r) => r.ms)).toEqual([1200]);
  });

  it("records a screen-open wait once, and not when the tab went to the background", async () => {
    noteScreenOpenStart("/shop/pos-sales");
    noteScreenOpenStart("/shop/pos-sales");
    noteScreenOpenEnd("/shop/pos-sales");
    noteScreenOpenEnd("/shop/pos-sales");
    noteScreenOpenStart("/shop/stock-report");
    noteScreenOpenHidden();
    noteScreenOpenEnd("/shop/stock-report");
    noteScreenOpenEnd("/shop/never-started");
    await flushAppTimings();
    const rows = sent.flat();
    expect(rows.map((r) => [r.metric, r.screen])).toEqual([["screen_open", "pos-sales"]]);
  });

  it("only clears the sender it was given", async () => {
    const other = async () => undefined;
    clearAppTimingSender(other);
    recordAppTiming("bill_save", "pos", 10);
    await flushAppTimings();
    expect(sent.flat()).toHaveLength(1);
  });
});

describe("timing display", () => {
  it("shows seconds and flags slow waits", async () => {
    const { formatTimingSeconds, isSlowTiming } = await import("./appTiming");
    expect(formatTimingSeconds(840)).toBe("0.8 s");
    expect(formatTimingSeconds(12_400)).toBe("12.4 s");
    expect(formatTimingSeconds(null)).toBe("—");
    expect(isSlowTiming("bill_save", 3500)).toBe(true);
    expect(isSlowTiming("bill_save", 2500)).toBe(false);
    expect(isSlowTiming("screen_open", 4000)).toBe(false);
    expect(isSlowTiming("screen_open", 6000)).toBe(true);
  });
});
