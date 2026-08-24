import { endOfMonth, format, startOfDay, startOfMonth } from "date-fns";
import { parsePersistedDate } from "@/lib/dashboardFilterPersistence";

export const SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH = "this_month";
export const SALE_ORDER_DASHBOARD_PERIOD_CUSTOM = "custom";

export type SaleOrderDashboardPeriodFilter =
  | typeof SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH
  | typeof SALE_ORDER_DASHBOARD_PERIOD_CUSTOM;

export function saleOrderDashboardThisMonthRange(now: Date = new Date()): {
  fromDate: Date;
  toDate: Date;
} {
  return {
    fromDate: startOfMonth(now),
    toDate: endOfMonth(now),
  };
}

function ymd(value: Date): string {
  return format(startOfDay(value), "yyyy-MM-dd");
}

export function isSaleOrderDashboardThisMonthRange(
  fromDate: Date | undefined,
  toDate: Date | undefined,
  now: Date = new Date(),
): boolean {
  if (!fromDate || !toDate) return false;
  const expected = saleOrderDashboardThisMonthRange(now);
  return ymd(fromDate) === ymd(expected.fromDate) && ymd(toDate) === ymd(expected.toDate);
}

/**
 * Default / restored date range for the Sales Order dashboard.
 * Never returns unbounded dates — missing or legacy all-time snapshots become this month.
 */
export function resolveSaleOrderDashboardDates(
  saved: Record<string, unknown> | null | undefined,
  now: Date = new Date(),
): { fromDate: Date; toDate: Date; periodFilter: SaleOrderDashboardPeriodFilter } {
  const month = saleOrderDashboardThisMonthRange(now);
  const period = typeof saved?.periodFilter === "string" ? saved.periodFilter : undefined;

  if (period === SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH || period === "monthly") {
    return { ...month, periodFilter: SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH };
  }

  const fromDate = parsePersistedDate(saved?.fromDate);
  const toDate = parsePersistedDate(saved?.toDate);

  if (fromDate && toDate) {
    if (isSaleOrderDashboardThisMonthRange(fromDate, toDate, now)) {
      return { ...month, periodFilter: SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH };
    }
    return { fromDate, toDate, periodFilter: SALE_ORDER_DASHBOARD_PERIOD_CUSTOM };
  }

  return { ...month, periodFilter: SALE_ORDER_DASHBOARD_PERIOD_THIS_MONTH };
}
