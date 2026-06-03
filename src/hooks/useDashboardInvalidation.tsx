import { useQueryClient } from "@tanstack/react-query";
import { invalidateCustomerFinancialSnapshot } from "@/utils/customerFinancialSnapshot";
import { notifyPosSalesChanged } from "@/utils/posSalesRefresh";

/**
 * Hook to invalidate dashboard queries after mutations
 * Call this after any data mutation that affects dashboard metrics
 */
export const useDashboardInvalidation = () => {
  const queryClient = useQueryClient();

  /**
   * Invalidate all dashboard-related queries for immediate UI refresh
   */
  const invalidateDashboard = () => {
    // Single consolidated RPC query (desktop)
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    
    // Mobile dashboard RPC queries
    queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-month-stats"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-customers-served"] });
    
    // Chart data (still separate queries)
    queryClient.invalidateQueries({ queryKey: ["sales-trend"] });
    queryClient.invalidateQueries({ queryKey: ["purchase-trend"] });
    queryClient.invalidateQueries({ queryKey: ["top-products"] });
  };

  /**
   * Invalidate only sales-related queries
   */
  const invalidateSales = (organizationId?: string) => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-month-stats"] });
    queryClient.invalidateQueries({ queryKey: ["sales-trend"] });
    queryClient.invalidateQueries({ queryKey: ["invoices"] });
    queryClient.invalidateQueries({ queryKey: ["invoice-dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["todays-sales"] });
    queryClient.invalidateQueries({ queryKey: ["pos-dashboard-sales"] });
    queryClient.invalidateQueries({ queryKey: ["today-sales"] });
    invalidateCustomerFinancialSnapshot(queryClient);
    notifyPosSalesChanged({ organizationId });
  };

  /**
   * Invalidate only purchase-related queries
   */
  const invalidatePurchases = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["purchase-trend"] });
  };

  /**
   * Invalidate customer-related queries
   */
  const invalidateCustomers = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-stats"] });
    invalidateCustomerFinancialSnapshot(queryClient);
  };

  /**
   * Invalidate supplier-related queries
   */
  const invalidateSuppliers = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
  };

  return {
    invalidateDashboard,
    invalidateSales,
    invalidatePurchases,
    invalidateCustomers,
    invalidateSuppliers,
  };
};
