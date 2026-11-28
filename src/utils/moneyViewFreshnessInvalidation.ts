import { coalesceRefresh } from "@/utils/coalesceRefresh";
import type { QueryClient } from "@tanstack/react-query";
import {
  CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY,
  invalidateCustomerFinancialSnapshot,
} from "@/utils/customerFinancialSnapshot";
import { ORGANIZATION_RECEIVABLES_QUERY_KEY } from "@/utils/organizationReceivables";
import { notifyMoneyViewChanged } from "@/utils/posSalesRefresh";
import { invalidateAndRefetchWithQueryFn } from "@/utils/refetchQueriesWithFn";
import { reloadViewsMatching } from "@/lib/liveStockRefresh";
import type { Query } from "@tanstack/react-query";

/** Debounce Realtime / cross-tab bursts so one save does not fan out dozens of refetches. */
export const MONEY_VIEW_FRESHNESS_DEBOUNCE_MS = 400;

/** Realtime-only: coalesce a POS save's sale + items + voucher events into one refetch. */
export const MONEY_VIEW_REALTIME_DEBOUNCE_MS = 1500;

/**
 * Invalidate derived money views — never patch cache from raw Realtime payloads.
 * Asked for by the live listener, by every save and when the browser tab is shown again; the
 * first request runs at once and repeats inside a short window become one more run.
 */
export function invalidateMoneyViewFreshness(
  queryClient: QueryClient,
  organizationId: string,
) {
  coalesceRefresh(queryClient, `money-views:${organizationId}`, () =>
    runMoneyViewFreshness(queryClient, organizationId),
  );
}

function runMoneyViewFreshness(
  queryClient: QueryClient,
  organizationId: string,
) {
  invalidateCustomerFinancialSnapshot(queryClient, organizationId);
  void queryClient.invalidateQueries({
    queryKey: ["pos-dashboard-sales", organizationId],
  });
  // Only mounted screens refetch now; cached-but-closed ones are marked stale and
  // refetch on next open. A cache restored from disk has no queryFn — refetching
  // that one stores "Missing queryFn" on the Sales dashboard.
  invalidateAndRefetchWithQueryFn(queryClient, ["sales-invoice-dashboard"], "active");
  invalidateAndRefetchWithQueryFn(queryClient, ["invoice-dashboard-unified"], "active");
  void queryClient.invalidateQueries({
    queryKey: ["payment-invoices"],
  });
  void queryClient.invalidateQueries({
    queryKey: ["payment-invoices-stats"],
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
  // Customer Ledger keeps its own keys for the balances it shows. Their keys do
  // not change when the list above refetches, so without these the ledger in
  // another tab kept the old balance / closing / payment history after a receipt.
  for (const key of CUSTOMER_LEDGER_DETAIL_QUERY_KEYS) {
    void queryClient.invalidateQueries({ queryKey: [key] });
  }
  // Payment screens the keys above miss (cashier report, daily tally, outstanding, advances,
  // receipts, …): those on show reload now, closed ones once when opened again.
  reloadViewsMatching(queryClient, isLiveMoneyQuery);
}

/**
 * First element of the query keys of other screens that show payments, balances or a bill's
 * payment status. A new such screen adds its key head here.
 */
export const LIVE_MONEY_QUERY_HEADS = [
  "voucher-entries",
  "journal-vouchers",
  "customer-receipt-vouchers",
  "customer-invoices",
  "customer-invoice-voucher-splits",
  "unpaid-customer-sales",
  "settle-pending-invoices",
  "customer-advance-balance",
  "customer-opening-balance-remaining",
  "customer-advances-history",
  "customer-credit-notes-history",
  "advance-dashboard",
  "advance-summary",
  "outstanding-dashboard",
  "payment-reconciliation",
  "todays-collection",
  "total-receivables",
  "daily-tally-vouchers",
  "daily-tally-advances",
  "daily-tally-advance-refunds",
  "floating-cashier-report-sales",
  "rpt-payment-collection",
  "rpt-customer-balance",
  "rpt-daily-cashier",
  "students-fee-collection",
  "fee-collection-summary",
  "student-fee-payments-history",
] as const;

const MONEY_HEADS: ReadonlySet<unknown> = new Set(LIVE_MONEY_QUERY_HEADS);

export function isLiveMoneyQuery(query: Pick<Query, "queryKey">): boolean {
  const head = query.queryKey[0];
  // Daily Cashier Report keeps one key per part: cashier-report-sales-v2, -receipts, -advances, …
  return MONEY_HEADS.has(head) || (typeof head === "string" && head.startsWith("cashier-report-"));
}

/** Customer Ledger queries that sit beside the "customer-ledger" list query. */
export const CUSTOMER_LEDGER_DETAIL_QUERY_KEYS = [
  "customer-ledger-canonical-filtered",
  "customer-ledger-canonical-page",
  "customer-ledger-audit-closing",
  "customer-payment-history",
] as const;

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
  // The one balance breakdown (CustomerAccountSummaryStrip) on every screen.
  void queryClient.invalidateQueries({
    queryKey: customerId
      ? ["customer-account-state-view", organizationId, customerId]
      : ["customer-account-state-view", organizationId],
  });
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
    ["sales-invoice-dashboard"],
    ["invoice-dashboard-unified"],
    ["payment-invoices"],
    [ORGANIZATION_RECEIVABLES_QUERY_KEY],
  ];
}
