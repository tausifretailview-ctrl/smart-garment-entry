import type { QueryClient } from "@tanstack/react-query";
import {
  CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY,
  invalidateCustomerFinancialSnapshot,
} from "@/utils/customerFinancialSnapshot";
import { ORGANIZATION_RECEIVABLES_QUERY_KEY } from "@/utils/organizationReceivables";
import { notifyMoneyViewChanged } from "@/utils/posSalesRefresh";

/** Debounce Realtime / cross-tab bursts so one save does not fan out dozens of refetches. */
export const MONEY_VIEW_FRESHNESS_DEBOUNCE_MS = 400;

/** Invalidate derived money views — never patch cache from raw Realtime payloads. */
export function invalidateMoneyViewFreshness(
  queryClient: QueryClient,
  organizationId: string,
) {
  invalidateCustomerFinancialSnapshot(queryClient, organizationId);
  void queryClient.invalidateQueries({
    queryKey: ["pos-dashboard-sales", organizationId],
  });
  void queryClient.invalidateQueries({
    queryKey: [ORGANIZATION_RECEIVABLES_QUERY_KEY],
  });
  void queryClient.invalidateQueries({
    queryKey: ["customer-transactions"],
  });
  void queryClient.invalidateQueries({
    queryKey: ["customers-with-balance", organizationId],
  });
  void queryClient.invalidateQueries({
    queryKey: ["customer-ledger"],
  });
}

/**
 * After a local mutation — invalidate this tab and ping other tabs on the same machine.
 * Do not call from Realtime/storage handlers (would ping-pong between tabs).
 */
export function invalidateMoneyViewsAfterMutation(
  queryClient: QueryClient,
  organizationId: string,
  customerId?: string | null,
) {
  notifyMoneyViewChanged({ organizationId });
  invalidateMoneyViewFreshness(queryClient, organizationId);
  if (customerId) {
    void queryClient.invalidateQueries({
      queryKey: ["customer-transactions", organizationId, customerId],
    });
  }
}

/** Query keys refreshed when a tab regains visibility (backup layer). */
export function getMoneyViewVisibilityQueryKeys(organizationId: string): string[][] {
  return [
    [CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY, organizationId],
    ["customer-party-balances", organizationId],
    ["customer-transactions", organizationId],
    ["customers-with-balance", organizationId],
    ["customer-ledger"],
    ["pos-dashboard-sales", organizationId],
    [ORGANIZATION_RECEIVABLES_QUERY_KEY],
  ];
}
