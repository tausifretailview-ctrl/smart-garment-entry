import type { QueryClient } from "@tanstack/react-query";
import {
  invalidateSalesQueriesNow,
  scheduleDeferredSalesInvalidation,
} from "@/utils/deferredSalesInvalidation";
import { invalidatePosDashboardQueries } from "@/utils/posDashboardSales";
import { notifyPosSalesChanged } from "@/utils/posSalesRefresh";

/** Sales invoice list + unified dashboard table pages. */
export function invalidateInvoiceDashboardQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ["sales-invoice-dashboard"] });
  void queryClient.invalidateQueries({ queryKey: ["invoice-dashboard-unified"] });
}

/** Status bar stock + receivables tile (v_dashboard_stock_summary / v_dashboard_receivables). */
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
  const opts = { refetchType: "all" as const };
  void queryClient.invalidateQueries({
    queryKey: organizationId
      ? ["stock-report-global-totals", organizationId]
      : ["stock-report-global-totals"],
    ...opts,
  });
  void queryClient.invalidateQueries({ queryKey: ["stock-report-filtered-totals"], ...opts });
  void queryClient.invalidateQueries({ queryKey: ["stock-report"], ...opts });
  void queryClient.invalidateQueries({
    queryKey: organizationId
      ? ["stock-report-filter-options", organizationId]
      : ["stock-report-filter-options"],
    ...opts,
  });
  // Product Name Wise Closing Stock + related
  void queryClient.invalidateQueries({ queryKey: ["item-wise-stock"], ...opts });
  void queryClient.invalidateQueries({ queryKey: ["item-wise-stock-totals"], ...opts });
  void queryClient.invalidateQueries({ queryKey: ["item-stock-filters"], ...opts });
  void queryClient.invalidateQueries({ queryKey: ["product-wise-stock"], ...opts });
  // Report attribute / party filter dropdowns (product brand/category/style/color + price-history parties)
  void queryClient.invalidateQueries({
    queryKey: organizationId
      ? ["item-wise-filter-options", organizationId]
      : ["item-wise-filter-options"],
    ...opts,
  });
  void queryClient.invalidateQueries({
    queryKey: organizationId
      ? ["product-tracking-filters", organizationId]
      : ["product-tracking-filters"],
    ...opts,
  });
  void queryClient.invalidateQueries({
    queryKey: organizationId
      ? ["price-history-filter-options", organizationId]
      : ["price-history-filter-options"],
    ...opts,
  });
  invalidateStatusBarSummary(queryClient, organizationId);
}

/** Purchase bill list + summary tiles + shared dashboard stats. */
export function invalidatePurchaseDashboardQueries(
  queryClient: QueryClient,
  organizationId?: string,
) {
  queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  queryClient.invalidateQueries({ queryKey: ["purchase-trend"] });
  queryClient.invalidateQueries({
    queryKey: organizationId ? ["purchase-bills", organizationId] : ["purchase-bills"],
    // Refetch inactive tab-cached list queries when Entry saves while dashboard is unmounted.
    refetchType: "all",
  });
  queryClient.invalidateQueries({
    queryKey: organizationId ? ["purchase-summary", organizationId] : ["purchase-summary"],
    refetchType: "all",
  });
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
};

/** After POS / sale save — invoice list pages refresh immediately; stats defer optional. */
export function invalidateAfterSaleSave(
  queryClient: QueryClient,
  organizationId?: string,
  options?: AfterSaleSaveOptions,
) {
  notifyPosSalesChanged({
    organizationId,
    saleDate: options?.saleDate,
    saleNumber: options?.saleNumber,
  });
  invalidateInvoiceDashboardQueries(queryClient);
  invalidatePosDashboardQueries(queryClient, organizationId);
  if (options?.deferDashboardInvalidation) {
    scheduleDeferredSalesInvalidation(queryClient, organizationId, { skipPosNotify: true });
  } else {
    invalidateSalesQueriesNow(queryClient, organizationId);
  }
  invalidateStockReportQueries(queryClient, organizationId);
}

/** After customer receipt / advance / delete that affects invoice settlement. */
export function invalidateAfterCustomerPaymentMutation(
  queryClient: QueryClient,
  organizationId?: string,
) {
  invalidateInvoiceDashboardQueries(queryClient);
  invalidatePosDashboardQueries(queryClient, organizationId);
  notifyPosSalesChanged({ organizationId });
  invalidateSalesQueriesNow(queryClient, organizationId);
}
