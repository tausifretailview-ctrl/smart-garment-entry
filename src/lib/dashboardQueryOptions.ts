/**
 * Main dashboard metrics/charts — manual refresh only to reduce Supabase reads.
 * First visit still loads once (empty cache). Use invalidateQueries on Refresh.
 */
export const DASHBOARD_MANUAL_REFRESH_OPTIONS = {
  staleTime: Number.POSITIVE_INFINITY,
  gcTime: 30 * 60 * 1000,
  refetchInterval: false as const,
  refetchOnWindowFocus: false,
  refetchOnMount: false,
  refetchOnReconnect: false,
} as const;

/** Query key prefixes cleared by the desktop dashboard Refresh button */
export const DASHBOARD_REFRESH_QUERY_KEYS = [
  "dashboard-stats",
  "sales-trend",
  "purchase-trend",
  "top-products",
  "customer-segment-counts",
  "organization-receivables",
] as const;
