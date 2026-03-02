import { useQueryClient } from "@tanstack/react-query";

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
  const invalidateSales = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-stats"] });
    queryClient.invalidateQueries({ queryKey: ["mobile-month-stats"] });
    queryClient.invalidateQueries({ queryKey: ["sales-trend"] });
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
