import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CustomerBalanceResult {
  balance: number;
  openingBalance: number;
  totalSales: number;
  totalPaid: number;
  adjustmentTotal: number;
  unusedAdvanceTotal: number;
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
        return { balance: 0, openingBalance: 0, totalSales: 0, totalPaid: 0, adjustmentTotal: 0, unusedAdvanceTotal: 0 };
      }

      // Fetch customer opening balance
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('opening_balance')
        .eq('id', customerId)
        .single();

      if (customerError) throw customerError;

      const openingBalance = customer?.opening_balance || 0;

      // Fetch all sales for this customer (id, net_amount and paid_amount)
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('id, net_amount, paid_amount')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId)
        .is('deleted_at', null);

      if (salesError) throw salesError;

      const saleIds = sales?.map(s => s.id) || [];

      // Fetch ALL voucher payments: both opening balance payments AND invoice payments
      const { data: allVouchers, error: voucherError } = await supabase
        .from('voucher_entries')
        .select('reference_id, reference_type, total_amount')
        .eq('organization_id', organizationId)
        .eq('voucher_type', 'receipt')
        .is('deleted_at', null);

      if (voucherError) throw voucherError;

      // Separate opening balance payments from invoice payments
      let openingBalanceVoucherPayments = 0;
      const invoiceVoucherPayments: Record<string, number> = {};

      allVouchers?.forEach(v => {
        if (!v.reference_id) return;
        
        if (saleIds.includes(v.reference_id)) {
          invoiceVoucherPayments[v.reference_id] = (invoiceVoucherPayments[v.reference_id] || 0) + (Number(v.total_amount) || 0);
        } 
        else if (v.reference_type === 'customer' && v.reference_id === customerId) {
          openingBalanceVoucherPayments += Number(v.total_amount) || 0;
        }
      });

      // Calculate totals
      const totalSales = sales?.reduce((sum, sale) => sum + (sale.net_amount || 0), 0) || 0;
      
      let totalPaidOnSales = 0;
      sales?.forEach(sale => {
        const salePaidAmount = sale.paid_amount || 0;
        const voucherAmount = invoiceVoucherPayments[sale.id] || 0;
        totalPaidOnSales += Math.max(salePaidAmount, voucherAmount);
      });

      const totalPaid = totalPaidOnSales + openingBalanceVoucherPayments;

      // Fetch balance adjustments
      const { data: adjustments, error: adjError } = await supabase
        .from('customer_balance_adjustments')
        .select('outstanding_difference')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId);

      if (adjError) throw adjError;

      // Sum outstanding_difference: positive = increased outstanding, negative = decreased
      const adjustmentTotal = adjustments?.reduce((sum, adj) => sum + (adj.outstanding_difference || 0), 0) || 0;

      // Fetch unused advances
      const { data: advances, error: advError } = await supabase
        .from('customer_advances')
        .select('amount, used_amount')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId)
        .in('status', ['active', 'partially_used']);

      if (advError) throw advError;

      const unusedAdvanceTotal = advances?.reduce((sum, adv) => {
        return sum + Math.max(0, (adv.amount || 0) - (adv.used_amount || 0));
      }, 0) || 0;

      // Balance = Opening + Sales - Paid + Adjustments - Unused Advances
      const balance = Math.round(openingBalance + totalSales - totalPaid + adjustmentTotal - unusedAdvanceTotal);

      return {
        balance,
        openingBalance: Math.round(openingBalance),
        totalSales: Math.round(totalSales),
        totalPaid: Math.round(totalPaid),
        adjustmentTotal: Math.round(adjustmentTotal),
        unusedAdvanceTotal: Math.round(unusedAdvanceTotal),
      };
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
    isLoading,
  };
}
