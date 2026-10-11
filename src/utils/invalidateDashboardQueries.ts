import type { QueryClient } from "@tanstack/react-query";
import {
  invalidateSalesQueriesNow,
  scheduleDeferredSalesInvalidation,
} from "@/utils/deferredSalesInvalidation";
import {
  invalidatePosDashboardQueries,
  seedPosDashboardCacheWithSale,
  type PosDashboardSaleSeed,
} from "@/utils/posDashboardSales";
import { notifyPosSalesChanged } from "@/utils/posSalesRefresh";
import { invalidateMoneyViewFreshness } from "@/utils/moneyViewFreshnessInvalidation";
import {
  invalidateAndRefetchWithQueryFn,
  invalidateQueriesWithQueryFn,
} from "@/utils/refetchQueriesWithFn";

/** Sales invoice list + unified dashboard table pages. */
export function invalidateInvoiceDashboardQueries(queryClient: QueryClient) {
  invalidateAndRefetchWithQueryFn(queryClient, ["sales-invoice-dashboard"]);
  invalidateAndRefetchWithQueryFn(queryClient, ["invoice-dashboard-unified"]);
}

/** Status bar stock + receivables tile (get_dashboard_stock_summary / v_dashboard_receivables). */
export function invalidateStatusBarSummary(queryClient: QueryClient, organizationId?: string) {
  void queryClient.invalidateQueries({
    queryKey: organizationId ? ["statusbar-summary", organizationId] : ["statusbar-summary"],
  });
}

/**
 * Stock Report / Product-wise stock KPI cards are cached (5 min, no refetchOnMount)
 * so tab-return stays snappy. After sale delete/cancel/purchase that changes stock_qty,
 * invalidate so cards re-read SUM(product_variants.stock_qty).
 */
export function invalidateStockReportQueries(
  queryClient: QueryClient,
  organizationId?: string,
) {
  // Also refetch unmounted cached screens, but only queries with a queryFn —
  // disk-restored ones would fail with "Missing queryFn" (see refetchQueriesWithFn).
  const refetch = (key: readonly unknown[]) =>
    invalidateAndRefetchWithQueryFn(queryClient, key);
  const orgKey = (head: string) => (organizationId ? [head, organizationId] : [head]);
  refetch(orgKey("stock-report-global-totals"));
  refetch(["stock-report-filtered-totals"]);
  refetch(["stock-report"]);
  refetch(orgKey("stock-report-filter-options"));
  // Product Name Wise Closing Stock + related
  refetch(["item-wise-stock"]);
  refetch(["item-wise-stock-totals"]);
  refetch(["item-stock-filters"]);
  refetch(["product-wise-stock"]);
  // Report attribute / party filter dropdowns (product brand/category/style/color + price-history parties)
  refetch(orgKey("item-wise-filter-options"));
  refetch(orgKey("product-tracking-filters"));
  refetch(orgKey("price-history-filter-options"));
  invalidateStatusBarSummary(queryClient, organizationId);
}

/**
 * Product Dashboard catalog + KPI tiles use refetchOnMount: false, so a stale
 * mark alone is not enough after Product Entry save — refetch inactive queries too.
 */
export function invalidateProductDashboardQueries(
  queryClient: QueryClient,
  organizationId?: string,
) {
  // Refetch unmounted cached panes too, skipping disk-restored queries with no
  // queryFn — those threw "Missing queryFn: [product-catalog, …]" after a save.
  const orgKey = (head: string) => (organizationId ? [head, organizationId] : [head]);
  const catalog = invalidateQueriesWithQueryFn(queryClient, orgKey("product-catalog"));
  const stats = invalidateQueriesWithQueryFn(queryClient, orgKey("product-dashboard-stats"));
  const filters = invalidateQueriesWithQueryFn(queryClient, orgKey("product-filter-options"));
  invalidateStockReportQueries(queryClient, organizationId);
  return Promise.all([catalog, stats, filters]);
}

/** Purchase bill list + summary tiles + shared dashboard stats. */
export function invalidatePurchaseDashboardQueries(
  queryClient: QueryClient,
  organizationId?: string,
) {
  queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  queryClient.invalidateQueries({ queryKey: ["net-profit-kpis"] });
  queryClient.invalidateQueries({ queryKey: ["purchase-trend"] });
  invalidateAndRefetchWithQueryFn(
    queryClient,
    organizationId ? ["purchase-bills", organizationId] : ["purchase-bills"],
  );
  invalidateAndRefetchWithQueryFn(
    queryClient,
    organizationId ? ["purchase-bills-summary", organizationId] : ["purchase-bills-summary"],
  );
  invalidateAndRefetchWithQueryFn(
    queryClient,
    organizationId ? ["purchase-summary", organizationId] : ["purchase-summary"],
  );
  queryClient.invalidateQueries({ queryKey: ["last-purchase-bill"] });
  queryClient.invalidateQueries({ queryKey: ["all-purchase-bill-ids"] });
  queryClient.invalidateQueries({ queryKey: ["pos-products"] });
  queryClient.invalidateQueries({ queryKey: ["product-dashboard"] });
  queryClient.invalidateQueries({ queryKey: ["products"] });
}

export type AfterSaleSaveOptions = {
  deferDashboardInvalidation?: boolean;
  saleDate?: string;
  saleNumber?: string;
  /** Just-saved sale — seeded into POS dashboard cache for instant last-bill display. */
  saleSnapshot?: PosDashboardSaleSeed | null;
};

/** After POS / sale save — invoice list pages refresh immediately; stats defer optional. */
export function invalidateAfterSaleSave(
  queryClient: QueryClient,
  organizationId?: string,
  options?: AfterSaleSaveOptions,
) {
  if (organizationId && options?.saleSnapshot?.id) {
    seedPosDashboardCacheWithSale(queryClient, organizationId, options.saleSnapshot);
  }
  notifyPosSalesChanged({
    organizationId,
    saleDate: options?.saleDate,
    saleNumber: options?.saleNumber,
  });
  invalidateInvoiceDashboardQueries(queryClient);
  if (options?.deferDashboardInvalidation) {
    // Soft-mark POS dashboard stale without forcing a heavy background refetch while
    // the user is still on POS print. Seeded cache shows the new bill immediately;
    // activation (pending marker) refetches with the tighter voucher lookback.
    void queryClient.invalidateQueries({
      queryKey: organizationId
        ? ["pos-dashboard-sales", organizationId]
        : ["pos-dashboard-sales"],
      refetchType: "none",
    });
    scheduleDeferredSalesInvalidation(queryClient, organizationId, { skipPosNotify: true });
  } else {
    invalidatePosDashboardQueries(queryClient, organizationId);
    invalidateSalesQueriesNow(queryClient, organizationId);
  }
  invalidateStockReportQueries(queryClient, organizationId);
}

/** After customer receipt / advance / delete that affects invoice settlement. */
export function invalidateAfterCustomerPaymentMutation(
  queryClient: QueryClient,
  organizationId?: string,
  customerId?: string | null,
) {
  invalidateInvoiceDashboardQueries(queryClient);
  invalidatePosDashboardQueries(queryClient, organizationId);
  notifyPosSalesChanged({ organizationId });
  invalidateSalesQueriesNow(queryClient, organizationId);
  if (organizationId) {
    invalidateMoneyViewFreshness(queryClient, organizationId);
    if (customerId) {
      void queryClient.invalidateQueries({
        queryKey: ["customer-transactions", organizationId, customerId],
      });
    }
  }
  queryClient.invalidateQueries({ queryKey: ["customer-account-state-view"] });
  queryClient.invalidateQueries({ queryKey: ["customer-account-audit"] });
}
