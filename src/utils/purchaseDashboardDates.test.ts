import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resolvePurchaseDashboardInitialPeriod,
  resolvePurchaseDashboardQueryDates,
} from "./purchaseDashboardDates";

describe("resolvePurchaseDashboardQueryDates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns empty range for all time", () => {
    expect(resolvePurchaseDashboardQueryDates("all", "", "")).toEqual({
      startDate: "",
      endDate: "",
    });
  });

  it("returns current month bounds for monthly", () => {
    expect(resolvePurchaseDashboardQueryDates("monthly", "", "")).toEqual({
      startDate: "2026-06-01",
      endDate: "2026-06-30",
    });
  });

  it("returns custom dates for custom period", () => {
    expect(resolvePurchaseDashboardQueryDates("custom", "2026-01-01", "2026-01-31")).toEqual({
      startDate: "2026-01-01",
      endDate: "2026-01-31",
    });
  });
});

describe("resolvePurchaseDashboardInitialPeriod", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-16T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults to all time when nothing is saved", () => {
    expect(resolvePurchaseDashboardInitialPeriod(null)).toEqual({
      periodFilter: "all",
      startDate: "",
      endDate: "",
    });
  });

  it("migrates legacy today-only saved range to all time", () => {
    expect(
      resolvePurchaseDashboardInitialPeriod({
        startDate: "2026-06-16",
        endDate: "2026-06-16",
      }),
    ).toEqual({
      periodFilter: "all",
      startDate: "",
      endDate: "",
    });
  });

  it("restores saved monthly period", () => {
    expect(resolvePurchaseDashboardInitialPeriod({ periodFilter: "monthly" })).toEqual({
      periodFilter: "monthly",
      startDate: "",
      endDate: "",
    });
  });
});
