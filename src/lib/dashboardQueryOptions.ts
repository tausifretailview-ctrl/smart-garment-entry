import { keepPreviousData } from "@tanstack/react-query";
import { STALE_DASHBOARD_TAB_RETURN } from "@/lib/queryStaleTimes";

/**
 * Main desktop dashboard metrics/charts — load when user opens dashboard or after login prefetch.
 * User Refresh still refetches all keys in DASHBOARD_REFRESH_QUERY_KEYS.
 */
export const DASHBOARD_MANUAL_REFRESH_OPTIONS = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: 30 * 60 * 1000,
  refetchInterval: false as const,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
} as const;

/**
 * List/dashboard queries on window-tabbed screens — keep data + scroll position
 * when switching browser tabs or ERP window tabs (matches POS/Sales Dashboard).
 */
export const DASHBOARD_TAB_RETURN_QUERY_OPTIONS = {
  staleTime: STALE_DASHBOARD_TAB_RETURN,
  gcTime: 30 * 60 * 1000,
  refetchOnMount: false,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
  placeholderData: keepPreviousData,
} as const;

/** Gate dashboard RPC/chart queries — false until user clicks Refresh. */
export function isDashboardMetricsQueryEnabled(
  organizationId: string | undefined,
  loadRequested: boolean,
): boolean {
  return Boolean(organizationId) && loadRequested;
}

/** Query key prefixes cleared by the desktop dashboard Refresh button */
export const DASHBOARD_REFRESH_QUERY_KEYS = [
  "dashboard-stats",
  "sales-trend",
  "purchase-trend",
  "top-products",
  "customer-segment-counts",
  "organization-receivables",
] as const;
