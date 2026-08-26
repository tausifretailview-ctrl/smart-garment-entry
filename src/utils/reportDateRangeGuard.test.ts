import { describe, expect, it } from "vitest";
import {
  isReportDateRangeTooWide,
  reportDateRangeSpanDays,
  MAX_REPORT_DATE_RANGE_DAYS,
} from "./reportDateRangeGuard";

describe("reportDateRangeGuard", () => {
  it("counts inclusive calendar days", () => {
    const from = new Date("2026-01-01T00:00:00");
    const to = new Date("2026-01-03T00:00:00");
    expect(reportDateRangeSpanDays(from, to)).toBe(3);
  });

  it("flags ranges wider than the default max", () => {
    const from = new Date("2024-01-01T00:00:00");
    const to = new Date("2026-01-01T00:00:00");
    expect(isReportDateRangeTooWide(from, to)).toBe(true);
    expect(isReportDateRangeTooWide(from, to, MAX_REPORT_DATE_RANGE_DAYS)).toBe(true);
  });

  it("allows a one-year window", () => {
    const to = new Date("2026-08-26T00:00:00");
    const from = new Date("2025-08-27T00:00:00");
    expect(isReportDateRangeTooWide(from, to)).toBe(false);
  });
});
