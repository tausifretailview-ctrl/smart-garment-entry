import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { DASHBOARD_TAB_RETURN_QUERY_OPTIONS } from "@/lib/dashboardQueryOptions";
import { fetchAllCustomers, fetchAllSalesSummary } from "@/utils/fetchAllRows";

/** Full-org customer list for ledger / accounts / outstanding (not paginated master grid). */
export const ORG_LEDGER_CUSTOMERS_QUERY_KEY = "org-ledger-customers";

/** Full-org sales summary for ledger math (minimal columns). */
export const ORG_LEDGER_SALES_SUMMARY_QUERY_KEY = "org-ledger-sales-summary";

/** @deprecated Use ORG_LEDGER_CUSTOMERS_QUERY_KEY — kept for invalidation compatibility. */
export const LEGACY_ACCOUNTS_CUSTOMERS_QUERY_KEY = "customers";

/** @deprecated Use ORG_LEDGER_SALES_SUMMARY_QUERY_KEY */
export const LEGACY_ACCOUNTS_SALES_SUMMARY_QUERY_KEY = "sales-summary-accounts";

const LEDGER_REFERENCE_STALE_MS = 10 * 60 * 1000;

export function orgLedgerCustomersQueryKey(organizationId: string) {
  return [ORG_LEDGER_CUSTOMERS_QUERY_KEY, organizationId] as const;
}

export function orgLedgerSalesSummaryQueryKey(organizationId: string) {
  return [ORG_LEDGER_SALES_SUMMARY_QUERY_KEY, organizationId] as const;
}

export const orgLedgerReferenceQueryOptions = {
  ...DASHBOARD_TAB_RETURN_QUERY_OPTIONS,
  staleTime: LEDGER_REFERENCE_STALE_MS,
  gcTime: 30 * 60 * 1000,
  refetchOnWindowFocus: false,
} as const;

export async function fetchOrgLedgerCustomersReference(
  organizationId: string,
  queryClient?: QueryClient,
) {
  const options = {
    queryKey: orgLedgerCustomersQueryKey(organizationId),
    queryFn: () => fetchAllCustomers(organizationId),
    ...orgLedgerReferenceQueryOptions,
  };
  if (queryClient) {
    return queryClient.fetchQuery(options);
  }
  return fetchAllCustomers(organizationId);
}

export async function fetchOrgLedgerSalesSummaryReference(
  organizationId: string,
  queryClient?: QueryClient,
) {
  const options = {
    queryKey: orgLedgerSalesSummaryQueryKey(organizationId),
    queryFn: () => fetchAllSalesSummary(organizationId),
    ...orgLedgerReferenceQueryOptions,
  };
  if (queryClient) {
    return queryClient.fetchQuery(options);
  }
  return fetchAllSalesSummary(organizationId);
}

/** Invalidate shared ledger reference caches after sales, receipts, or customer writes. */
export function invalidateOrgLedgerReferenceData(
  queryClient: QueryClient,
  organizationId?: string | null,
) {
  if (!organizationId) return;
  queryClient.invalidateQueries({ queryKey: orgLedgerCustomersQueryKey(organizationId) });
  queryClient.invalidateQueries({ queryKey: orgLedgerSalesSummaryQueryKey(organizationId) });
  // Legacy keys still used by some invalidation call sites
  queryClient.invalidateQueries({ queryKey: [LEGACY_ACCOUNTS_CUSTOMERS_QUERY_KEY, organizationId] });
  queryClient.invalidateQueries({ queryKey: [LEGACY_ACCOUNTS_SALES_SUMMARY_QUERY_KEY, organizationId] });
  queryClient.invalidateQueries({ queryKey: ["customer-ledger", organizationId] });
  queryClient.invalidateQueries({ queryKey: ["outstanding-dashboard", organizationId] });
  queryClient.invalidateQueries({ queryKey: ["activity-center-payments", organizationId] });
}

type UseOrgLedgerReferenceDataOptions = {
  enabled?: boolean;
  loadCustomers?: boolean;
  loadSalesSummary?: boolean;
};

/**
 * Single cached source for full-org customers + sales summary used by Accounts,
 * Customer Ledger, and Outstanding tab. React Query dedupes across mounted screens.
 */
export function useOrgLedgerReferenceData(
  organizationId: string | undefined,
  options?: UseOrgLedgerReferenceDataOptions,
) {
  const {
    enabled = true,
    loadCustomers = true,
    loadSalesSummary = true,
  } = options ?? {};

  const orgReady = !!organizationId && enabled;

  const customersQuery = useQuery({
    queryKey: orgLedgerCustomersQueryKey(organizationId!),
    queryFn: () => fetchAllCustomers(organizationId!),
    enabled: orgReady && loadCustomers,
    ...orgLedgerReferenceQueryOptions,
  });

  const salesSummaryQuery = useQuery({
    queryKey: orgLedgerSalesSummaryQueryKey(organizationId!),
    queryFn: () => fetchAllSalesSummary(organizationId!),
    enabled: orgReady && loadSalesSummary,
    ...orgLedgerReferenceQueryOptions,
  });

  return {
    customers: customersQuery.data,
    salesSummary: salesSummaryQuery.data,
    customersLoading: customersQuery.isLoading,
    customersFetching: customersQuery.isFetching,
    salesSummaryLoading: salesSummaryQuery.isLoading,
    salesSummaryFetching: salesSummaryQuery.isFetching,
  };
}

/** Imperative cache reader for large queryFns (Customer Ledger, Outstanding). */
export function useOrgLedgerReferenceFetcher() {
  const queryClient = useQueryClient();
  return {
    fetchCustomers: (organizationId: string) =>
      fetchOrgLedgerCustomersReference(organizationId, queryClient),
    fetchSalesSummary: (organizationId: string) =>
      fetchOrgLedgerSalesSummaryReference(organizationId, queryClient),
  };
}
