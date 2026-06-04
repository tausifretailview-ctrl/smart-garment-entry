/**
 * Main desktop dashboard metrics/charts — no automatic Supabase reads.
 * Queries stay disabled until the user clicks Refresh (see Index.tsx).
 */
export const DASHBOARD_MANUAL_REFRESH_OPTIONS = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: 30 * 60 * 1000,
  refetchInterval: false as const,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
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
