import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchCustomerBalanceSnapshot } from "@/utils/customerBalanceUtils";

interface CustomerBalanceResult {
  balance: number;
  openingBalance: number;
  totalSales: number;
  totalPaid: number;
  adjustmentTotal: number;
  unusedAdvanceTotal: number;
  saleReturnTotal: number;
  totalSalesGross: number;
  totalSaleReturnAdjustOnSales: number;
  totalCashPaid: number;
  totalAdvanceApplied: number;
  totalCnApplied: number;
  isLoading: boolean;
}

/**
 * Hook to calculate accurate customer balance including:
 * - Opening balance from customer record
 * - All sales net_amount
 * - All payments: at-sale (paid_amount) + voucher receipts (including invoice payments)
 * - Balance adjustments (outstanding_difference)
 * - Unused advances (active/partially_used)
 */
export function useCustomerBalance(customerId: string | null, organizationId: string | null): CustomerBalanceResult {
  const { data, isLoading } = useQuery({
    queryKey: ['customer-balance', customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) {
        return {
          balance: 0,
          openingBalance: 0,
          totalSales: 0,
          totalPaid: 0,
          adjustmentTotal: 0,
          unusedAdvanceTotal: 0,
          saleReturnTotal: 0,
          totalSalesGross: 0,
          totalSaleReturnAdjustOnSales: 0,
          totalCashPaid: 0,
          totalAdvanceApplied: 0,
          totalCnApplied: 0,
        };
      }

      return await fetchCustomerBalanceSnapshot(supabase, organizationId, customerId);
    },
    enabled: !!customerId && !!organizationId,
    staleTime: 60000,
  });

  return {
    balance: data?.balance || 0,
    openingBalance: data?.openingBalance || 0,
    totalSales: data?.totalSales || 0,
    totalPaid: data?.totalPaid || 0,
    adjustmentTotal: data?.adjustmentTotal || 0,
    unusedAdvanceTotal: data?.unusedAdvanceTotal || 0,
    saleReturnTotal: data?.saleReturnTotal || 0,
    totalSalesGross: data?.totalSalesGross || 0,
    totalSaleReturnAdjustOnSales: data?.totalSaleReturnAdjustOnSales || 0,
    totalCashPaid: data?.totalCashPaid || 0,
    totalAdvanceApplied: data?.totalAdvanceApplied || 0,
    totalCnApplied: data?.totalCnApplied || 0,
    isLoading,
  };
}
