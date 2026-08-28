import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { format } from "date-fns";
import {
  isSaleOrderDashboardThisMonthRange,
  resolveSaleOrderDashboardDates,
  SALE_ORDER_DASHBOARD_PERIOD_CUSTOM,
  SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH,
  saleOrderDashboardThisMonthRange,
} from "./saleOrderDashboardDates";

describe("saleOrderDashboardDates", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defaults open range to the current calendar month", () => {
    const range = saleOrderDashboardThisMonthRange();
    expect(format(range.fromDate, "yyyy-MM-dd")).toBe("2026-08-01");
    expect(format(range.toDate, "yyyy-MM-dd")).toBe("2026-08-31");
  });

  it("treats missing / all-time snapshots as this month, never unbounded", () => {
    expect(resolveSaleOrderDashboardDates(null)).toMatchObject({
      periodFilter: SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH,
    });
    expect(format(resolveSaleOrderDashboardDates(null).fromDate, "yyyy-MM-dd")).toBe("2026-08-01");
    expect(format(resolveSaleOrderDashboardDates({}).toDate, "yyyy-MM-dd")).toBe("2026-08-31");
    expect(
      format(resolveSaleOrderDashboardDates({ fromDate: "2026-08-01" }).fromDate, "yyyy-MM-dd"),
    ).toBe("2026-08-01");
  });

  it("refreshes this_month / monthly intent to the current month bounds", () => {
    const resolved = resolveSaleOrderDashboardDates({
      periodFilter: "this_month",
      fromDate: "2026-07-01T00:00:00.000Z",
      toDate: "2026-07-31T23:59:59.999Z",
    });
    expect(resolved.periodFilter).toBe(SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH);
    expect(format(resolved.fromDate, "yyyy-MM-dd")).toBe("2026-08-01");
    expect(format(resolved.toDate, "yyyy-MM-dd")).toBe("2026-08-31");

    const monthly = resolveSaleOrderDashboardDates({ periodFilter: "monthly" });
    expect(format(monthly.fromDate, "yyyy-MM-dd")).toBe("2026-08-01");
  });

  it("keeps an explicit custom range", () => {
    const resolved = resolveSaleOrderDashboardDates({
      periodFilter: SALE_ORDER_DASHBOARD_PERIOD_CUSTOM,
      fromDate: "2026-01-15T12:00:00.000Z",
      toDate: "2026-01-20T12:00:00.000Z",
    });
    expect(resolved.periodFilter).toBe(SALE_ORDER_DASHBOARD_PERIOD_CUSTOM);
    expect(format(resolved.fromDate, "yyyy-MM-dd")).toBe("2026-01-15");
    expect(format(resolved.toDate, "yyyy-MM-dd")).toBe("2026-01-20");
  });

  it("classifies the current month bounds as this_month even without a saved period", () => {
    const range = saleOrderDashboardThisMonthRange();
    const resolved = resolveSaleOrderDashboardDates({
      fromDate: range.fromDate.toISOString(),
      toDate: range.toDate.toISOString(),
    });
    expect(resolved.periodFilter).toBe(SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH);
    expect(isSaleOrderDashboardThisMonthRange(range.fromDate, range.toDate)).toBe(true);
    expect(isSaleOrderDashboardThisMonthRange(undefined, range.toDate)).toBe(false);
  });
});
