import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CustomerBalanceResult {
  balance: number;
  openingBalance: number;
  totalSales: number;
  totalPaid: number;
  isLoading: boolean;
}

/**
 * Hook to calculate accurate customer balance including:
 * - Opening balance from customer record
 * - All sales net_amount
 * - All payments: at-sale (paid_amount) + voucher receipts (including invoice payments)
 */
export function useCustomerBalance(customerId: string | null, organizationId: string | null): CustomerBalanceResult {
  const { data, isLoading } = useQuery({
    queryKey: ['customer-balance', customerId, organizationId],
    queryFn: async () => {
      if (!customerId || !organizationId) {
        return { balance: 0, openingBalance: 0, totalSales: 0, totalPaid: 0 };
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
        
        // Check if this is a payment for one of this customer's invoices
        if (saleIds.includes(v.reference_id)) {
          invoiceVoucherPayments[v.reference_id] = (invoiceVoucherPayments[v.reference_id] || 0) + (Number(v.total_amount) || 0);
        } 
        // Check if this is an opening balance payment for this customer
        else if (v.reference_type === 'customer' && v.reference_id === customerId) {
          openingBalanceVoucherPayments += Number(v.total_amount) || 0;
        }
      });

      // Calculate totals
      const totalSales = sales?.reduce((sum, sale) => sum + (sale.net_amount || 0), 0) || 0;
      
      // For each sale, use the MAX of paid_amount or voucher payments to handle:
      // - Old data where paid_amount wasn't updated when voucher was created
      // - New data where paid_amount is properly updated
      let totalPaidOnSales = 0;
      sales?.forEach(sale => {
        const salePaidAmount = sale.paid_amount || 0;
        const voucherAmount = invoiceVoucherPayments[sale.id] || 0;
        // Use max to avoid double-counting but also catch old unsynced data
        totalPaidOnSales += Math.max(salePaidAmount, voucherAmount);
      });

      // Total paid = payments on sales + opening balance voucher payments
      const totalPaid = totalPaidOnSales + openingBalanceVoucherPayments;

      // Balance = Opening Balance + Total Sales - Total Paid
      const balance = openingBalance + totalSales - totalPaid;

      return {
        balance,
        openingBalance,
        totalSales,
        totalPaid,
      };
    },
    enabled: !!customerId && !!organizationId,
    staleTime: 30000, // Cache for 30 seconds
  });

  return {
    balance: data?.balance || 0,
    openingBalance: data?.openingBalance || 0,
    totalSales: data?.totalSales || 0,
    totalPaid: data?.totalPaid || 0,
    isLoading,
  };
}
