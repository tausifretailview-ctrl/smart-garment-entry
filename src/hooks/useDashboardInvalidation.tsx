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
    // Sales-related queries
    queryClient.invalidateQueries({ queryKey: ["total-sales"] });
    queryClient.invalidateQueries({ queryKey: ["sale-returns"] });
    queryClient.invalidateQueries({ queryKey: ["receivables"] });
    queryClient.invalidateQueries({ queryKey: ["cash-collection"] });
    queryClient.invalidateQueries({ queryKey: ["profit-data-cogs"] });
    
    // Stock-related queries (now view-based)
    queryClient.invalidateQueries({ queryKey: ["stock-summary"] });
    
    // Purchase-related queries
    queryClient.invalidateQueries({ queryKey: ["purchase-total"] });
    queryClient.invalidateQueries({ queryKey: ["purchase-returns"] });
    
    // Count queries (now single view-based query)
    queryClient.invalidateQueries({ queryKey: ["dashboard-counts"] });
    
    // Chart data
    queryClient.invalidateQueries({ queryKey: ["sales-trend"] });
    queryClient.invalidateQueries({ queryKey: ["purchase-trend"] });
    queryClient.invalidateQueries({ queryKey: ["top-products"] });
    
    // Mobile dashboard
    queryClient.invalidateQueries({ queryKey: ["mobile-dashboard-summary"] });
  };

  /**
   * Invalidate only sales-related queries
   */
  const invalidateSales = () => {
    queryClient.invalidateQueries({ queryKey: ["total-sales"] });
    queryClient.invalidateQueries({ queryKey: ["receivables"] });
    queryClient.invalidateQueries({ queryKey: ["cash-collection"] });
    queryClient.invalidateQueries({ queryKey: ["profit-data-cogs"] });
    queryClient.invalidateQueries({ queryKey: ["stock-summary"] });
    queryClient.invalidateQueries({ queryKey: ["sales-trend"] });
  };

  /**
   * Invalidate only purchase-related queries
   */
  const invalidatePurchases = () => {
    queryClient.invalidateQueries({ queryKey: ["purchase-total"] });
    queryClient.invalidateQueries({ queryKey: ["stock-summary"] });
    queryClient.invalidateQueries({ queryKey: ["purchase-trend"] });
  };

  /**
   * Invalidate customer-related queries
   */
  const invalidateCustomers = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-counts"] });
    queryClient.invalidateQueries({ queryKey: ["receivables"] });
  };

  /**
   * Invalidate supplier-related queries
   */
  const invalidateSuppliers = () => {
    queryClient.invalidateQueries({ queryKey: ["dashboard-counts"] });
  };

  return {
    invalidateDashboard,
    invalidateSales,
    invalidatePurchases,
    invalidateCustomers,
    invalidateSuppliers,
  };
};
