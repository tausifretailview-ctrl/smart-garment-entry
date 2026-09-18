import { describe, expect, it } from "vitest";
import { normalizeYmdRange, salesReportTimestamptzBounds } from "./localDayBounds";

describe("salesReportTimestamptzBounds", () => {
  it("swaps inverted start/end calendar days", () => {
    const { fromYmd, toYmd } = salesReportTimestamptzBounds("2026-09-18", "2026-09-01");
    expect(fromYmd).toBe("2026-09-01");
    expect(toYmd).toBe("2026-09-18");
  });

  it("end bound is after UTC midnight on the end calendar day", () => {
    const { endIso } = salesReportTimestamptzBounds("2026-09-18", "2026-09-18");
    const endMs = new Date(endIso).getTime();
    const utcMidnightMs = new Date("2026-09-18T00:00:00.000Z").getTime();
    expect(endMs).toBeGreaterThan(utcMidnightMs);
  });

  it("normalizeYmdRange keeps order when already valid", () => {
    expect(normalizeYmdRange("2026-09-01", "2026-09-18")).toEqual({
      fromYmd: "2026-09-01",
      toYmd: "2026-09-18",
    });
  });
});
