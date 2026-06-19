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

/** Purchase bill list + summary tiles + shared dashboard stats. */
export function invalidatePurchaseDashboardQueries(queryClient: QueryClient) {
  queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  queryClient.invalidateQueries({ queryKey: ["purchase-trend"] });
  queryClient.invalidateQueries({ queryKey: ["purchase-bills"] });
  queryClient.invalidateQueries({ queryKey: ["purchase-summary"] });
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
