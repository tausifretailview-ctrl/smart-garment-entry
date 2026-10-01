import { describe, expect, it } from "vitest";
import {
  formatReturnTime,
  formatTimelineStamp,
  isDateOnlyTimestamp,
  resolveEventStamp,
} from "./returnTimeDisplay";

describe("isDateOnlyTimestamp", () => {
  it("detects bare dates and midnight-UTC dates", () => {
    expect(isDateOnlyTimestamp("2026-10-01")).toBe(true);
    expect(isDateOnlyTimestamp("2026-10-01T00:00:00+00:00")).toBe(true);
    expect(isDateOnlyTimestamp("2026-10-01T00:00:00.000Z")).toBe(true);
    expect(isDateOnlyTimestamp("2026-10-01 00:00:00+00")).toBe(true);
  });

  it("does not flag real times", () => {
    expect(isDateOnlyTimestamp("2026-10-01T03:16:22.123+00:00")).toBe(false);
    expect(isDateOnlyTimestamp("2026-10-01T12:00:00")).toBe(false);
    expect(isDateOnlyTimestamp(null)).toBe(false);
  });
});

describe("resolveEventStamp", () => {
  it("prefers the real creation time", () => {
    const stamp = resolveEventStamp("2026-10-01T03:16:22+00:00", "2026-10-01");
    expect(stamp).toEqual({ timestamp: "2026-10-01T03:16:22+00:00", hasTime: true });
  });

  it("falls back to the day only, never an invented clock time", () => {
    const stamp = resolveEventStamp(null, "2026-10-01T00:00:00+00:00");
    expect(stamp).toEqual({ timestamp: "2026-10-01T12:00:00", hasTime: false });
    expect(formatTimelineStamp(stamp!)).toBe("01-Oct");
  });

  it("ignores a created_at that is itself a bare date", () => {
    expect(resolveEventStamp("2026-10-01", "2026-10-01")?.hasTime).toBe(false);
  });

  it("returns null with nothing usable", () => {
    expect(resolveEventStamp(null, null)).toBeNull();
    expect(resolveEventStamp("not-a-date", "bad")).toBeNull();
  });
});

describe("formatting", () => {
  it("formats a real timestamp in the viewer's local time", () => {
    const iso = "2026-10-01T03:16:22.000Z";
    const d = new Date(iso);
    const hours12 = d.getHours() % 12 || 12;
    const expected = `${String(hours12).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${d.getHours() >= 12 ? "PM" : "AM"}`;
    expect(formatReturnTime(iso)).toBe(expected);
    expect(formatTimelineStamp({ timestamp: iso, hasTime: true })).toContain(expected);
  });

  it("returns empty for missing or invalid input", () => {
    expect(formatReturnTime(null)).toBe("");
    expect(formatReturnTime("nope")).toBe("");
  });
});
