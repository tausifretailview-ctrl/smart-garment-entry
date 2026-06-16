import { endOfMonth, endOfYear, format, startOfMonth, startOfYear } from "date-fns";

export type PurchaseDashboardPeriodFilter = "monthly" | "yearly" | "all" | "custom";

export function resolvePurchaseDashboardQueryDates(
  periodFilter: string,
  customStartDate: string,
  customEndDate: string,
): { startDate: string; endDate: string } {
  const today = new Date();
  switch (periodFilter) {
    case "monthly":
      return {
        startDate: format(startOfMonth(today), "yyyy-MM-dd"),
        endDate: format(endOfMonth(today), "yyyy-MM-dd"),
      };
    case "yearly":
      return {
        startDate: format(startOfYear(today), "yyyy-MM-dd"),
        endDate: format(endOfYear(today), "yyyy-MM-dd"),
      };
    case "custom":
      return { startDate: customStartDate, endDate: customEndDate };
    case "all":
    default:
      return { startDate: "", endDate: "" };
  }
}

/** Default period + custom dates from session storage (handles legacy today-only range). */
export function resolvePurchaseDashboardInitialPeriod(
  saved: Record<string, unknown> | null | undefined,
): { periodFilter: PurchaseDashboardPeriodFilter; startDate: string; endDate: string } {
  const savedPeriod =
    typeof saved?.periodFilter === "string" ? saved.periodFilter : undefined;
  const savedStart = typeof saved?.startDate === "string" ? saved.startDate : "";
  const savedEnd = typeof saved?.endDate === "string" ? saved.endDate : "";
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const isLegacyTodayOnly =
    !savedPeriod && savedStart === todayStr && savedEnd === todayStr;

  if (savedPeriod === "monthly" || savedPeriod === "yearly" || savedPeriod === "all") {
    return { periodFilter: savedPeriod, startDate: "", endDate: "" };
  }

  if (savedPeriod === "custom") {
    return { periodFilter: "custom", startDate: savedStart, endDate: savedEnd };
  }

  if (isLegacyTodayOnly) {
    return { periodFilter: "all", startDate: "", endDate: "" };
  }

  if (savedStart || savedEnd) {
    return { periodFilter: "custom", startDate: savedStart, endDate: savedEnd };
  }

  return { periodFilter: "all", startDate: "", endDate: "" };
}
