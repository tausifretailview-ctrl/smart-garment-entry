import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateCustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";
import {
  flushDeferredSalesInvalidation,
  invalidateSalesQueriesNow,
  scheduleDeferredSalesInvalidation,
} from "@/utils/deferredSalesInvalidation";
import { invalidatePurchaseDashboardQueries } from "@/utils/invalidateDashboardQueries";

/**
 * Hook to invalidate dashboard queries after mutations
 * Call this after any data mutation that affects dashboard metrics
 */
export const useDashboardInvalidation = () => {
  const queryClient = useQueryClient();

  const invalidateDashboard = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-month-stats"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-customers-served"] });
    queryClient.invalidateQueries({ queryKey: ["sales-trend"] });
    queryClient.invalidateQueries({ queryKey: ["purchase-trend"] });
    queryClient.invalidateQueries({ queryKey: ["top-products"] });
    queryClient.invalidateQueries({ queryKey: ["statusbar-summary"] });
  }, [queryClient]);

  const invalidateSales = useCallback(
    (organizationId?: string) => {
      invalidateSalesQueriesNow(queryClient, organizationId);
      queryClient.invalidateQueries({ queryKey: ["statusbar-summary"] });
    },
    [queryClient],
  );

  const scheduleInvalidateSales = useCallback(
    (organizationId?: string, options?: { skipPosNotify?: boolean }) => {
      scheduleDeferredSalesInvalidation(queryClient, organizationId, options);
    },
    [queryClient],
  );

  const flushScheduledSalesInvalidation = useCallback(
    (organizationId?: string, options?: { notifyPos?: boolean }) => {
      flushDeferredSalesInvalidation(queryClient, organizationId, options);
    },
    [queryClient],
  );

  const invalidatePurchases = useCallback(() => {
    invalidatePurchaseDashboardQueries(queryClient);
    queryClient.invalidateQueries({ queryKey: ["statusbar-summary"] });
  }, [queryClient]);

  const invalidateCustomers = useCallback(
    (organizationId?: string) => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-stats"] });
      invalidateCustomerFinancialSnapshot(queryClient, organizationId);
      queryClient.invalidateQueries({ queryKey: ["statusbar-summary"] });
    },
    [queryClient],
  );

  const invalidateSuppliers = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  }, [queryClient]);

  return {
    invalidateDashboard,
    invalidateSales,
    scheduleInvalidateSales,
    flushScheduledSalesInvalidation,
    invalidatePurchases,
    invalidateCustomers,
    invalidateSuppliers,
  };
};
