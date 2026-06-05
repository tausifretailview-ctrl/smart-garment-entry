import type { QueryClient } from "@tanstack/react-query";
import { invalidateCustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";
import { notifyPosSalesChanged } from "@/utils/posSalesRefresh";

/** Fallback if user skips print — still refresh dashboards within a few seconds. */
export const SALES_INVALIDATION_DEFER_MS = 8_000;

type PendingSalesInvalidation = {
  organizationId?: string;
  skipPosNotify?: boolean;
};

let pending: PendingSalesInvalidation | null = null;
let deferTimer: ReturnType<typeof setTimeout> | null = null;

function runSalesInvalidation(queryClient: QueryClient, opts: PendingSalesInvalidation) {
  queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-stats"] });
  queryClient.invalidateQueries({ queryKey: ["mobile-month-stats"] });
  queryClient.invalidateQueries({ queryKey: ["sales-trend"] });
  queryClient.invalidateQueries({ queryKey: ["invoice-dashboard-unified"] });
  queryClient.invalidateQueries({ queryKey: ["invoice-dashboard-reconciled-stats"] });
  queryClient.invalidateQueries({ queryKey: ["todays-sales"] });
  queryClient.invalidateQueries({ queryKey: ["today-sales"] });
  invalidateCustomerFinancialSnapshot(queryClient);
  if (!opts.skipPosNotify) {
    notifyPosSalesChanged({ organizationId: opts.organizationId });
  }
}

export function scheduleDeferredSalesInvalidation(
  queryClient: QueryClient,
  organizationId?: string,
  options?: { skipPosNotify?: boolean },
) {
  pending = {
    organizationId,
    skipPosNotify: options?.skipPosNotify,
  };
  if (deferTimer) clearTimeout(deferTimer);
  deferTimer = setTimeout(() => {
    deferTimer = null;
    const snapshot = pending;
    pending = null;
    if (snapshot) runSalesInvalidation(queryClient, snapshot);
  }, SALES_INVALIDATION_DEFER_MS);
}

export function flushDeferredSalesInvalidation(
  queryClient: QueryClient,
  organizationId?: string,
  options?: { notifyPos?: boolean },
) {
  if (deferTimer) {
    clearTimeout(deferTimer);
    deferTimer = null;
  }
  const snapshot = pending ?? { organizationId, skipPosNotify: true };
  pending = null;
  const notifyPos = options?.notifyPos !== false;
  runSalesInvalidation(queryClient, {
    organizationId: organizationId ?? snapshot.organizationId,
    skipPosNotify: !notifyPos,
  });
}

export function invalidateSalesQueriesNow(
  queryClient: QueryClient,
  organizationId?: string,
) {
  if (deferTimer) {
    clearTimeout(deferTimer);
    deferTimer = null;
  }
  pending = null;
  runSalesInvalidation(queryClient, { organizationId });
}
