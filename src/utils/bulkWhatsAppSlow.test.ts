import { describe, expect, it } from "vitest";
import * as gateway from "../../wa-gateway/src/slowWindow";
import {
  SLOW_DEFAULT_WINDOW as W,
  minutesToTime,
  planSlowSend,
  slowStartsTomorrowByDefault,
  timeToMinutes,
  windowOpenAt,
} from "./bulkWhatsAppSlow";

/** A moment given as IST wall time. */
const ist = (s: string) => Date.parse(`${s}+05:30`);

describe("send slowly all day", () => {
  it("is open inside shop hours and waits for the next opening outside them", () => {
    expect(windowOpenAt(ist("2026-10-30T12:00:00"), W)).toBe(ist("2026-10-30T12:00:00"));
    expect(windowOpenAt(ist("2026-10-30T08:00:00"), W)).toBe(ist("2026-10-30T10:00:00"));
    expect(windowOpenAt(ist("2026-10-30T21:00:00"), W)).toBe(ist("2026-10-31T10:00:00"));
    expect(windowOpenAt(ist("2026-10-31T02:00:00"), W)).toBe(ist("2026-10-31T10:00:00"));
  });

  it("matches the WhatsApp server's copy", () => {
    for (let h = 0; h < 48; h++) {
      const t = ist("2026-10-30T00:17:00") + h * 30 * 60_000;
      expect(gateway.windowOpenAt(t, W)).toBe(windowOpenAt(t, W));
    }
    expect(gateway.parseWindow({ from: 600, to: 630 })).toBeUndefined();
    expect(gateway.parseWindow({ from: 600, to: 1260 })).toEqual(W);
  });

  it("spreads 100 messages over a full day of shop hours", () => {
    const p = planSlowSend(100, ist("2026-10-30T09:00:00"), W, false);
    expect(p.startAt).toBe(ist("2026-10-30T10:00:00"));
    expect(p.gapMs).toBe(Math.floor((11 * 60 * 60_000) / 100)); // 6.6 min
    expect(p.days).toBe(1);
    expect(p.finishAt).toBeLessThan(ist("2026-10-30T21:00:00"));
  });

  it("starts now inside shop hours, using the hours left today", () => {
    const p = planSlowSend(30, ist("2026-10-30T15:00:00"), W, false);
    expect(p.startAt).toBeNull();
    expect(p.gapMs).toBe(12 * 60_000);
    expect(p.days).toBe(1);
  });

  it("starts tomorrow morning when asked", () => {
    const p = planSlowSend(100, ist("2026-10-30T20:49:00"), W, true);
    expect(p.startAt).toBe(ist("2026-10-31T10:00:00"));
    expect(p.days).toBe(1);
    expect(slowStartsTomorrowByDefault(ist("2026-10-30T20:49:00"), W)).toBe(true);
    expect(slowStartsTomorrowByDefault(ist("2026-10-30T12:00:00"), W)).toBe(false);
  });

  it("carries a long list over to the next day's hours", () => {
    const p = planSlowSend(1000, ist("2026-10-30T10:00:00"), W, false);
    expect(p.gapMs).toBe(60_000);
    expect(p.days).toBe(2);
    expect(windowOpenAt(p.finishAt, W)).toBe(p.finishAt);
  });

  it("sends only so many a day when a daily count is set", () => {
    const p = planSlowSend(1000, ist("2026-10-30T09:00:00"), W, false, 150);
    expect(p.gapMs).toBe(Math.floor((11 * 60 * 60_000) / 150)); // 4.4 min
    expect(p.days).toBe(7);
    const short = planSlowSend(100, ist("2026-10-30T09:00:00"), W, false, 150);
    expect(short.days).toBe(1);
    expect(short.gapMs).toBe(Math.floor((11 * 60 * 60_000) / 100));
  });

  it("reads and writes time boxes", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(timeToMinutes("x")).toBeNull();
    expect(minutesToTime(1260)).toBe("21:00");
  });
});
