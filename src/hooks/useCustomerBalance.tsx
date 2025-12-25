import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CustomerBalanceResult {
  balance: number;
  openingBalance: number;
  totalSales: number;
  totalPaid: number;
  isLoading: boolean;
}

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

      // Fetch all sales for this customer (net_amount and paid_amount)
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('net_amount, paid_amount')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId)
        .is('deleted_at', null);

      if (salesError) throw salesError;

      // Fetch voucher payments made for this customer (opening balance payments, etc.)
      const { data: voucherPayments, error: voucherError } = await supabase
        .from('voucher_entries')
        .select('total_amount')
        .eq('reference_type', 'customer')
        .eq('reference_id', customerId)
        .eq('organization_id', organizationId)
        .eq('voucher_type', 'receipt')
        .is('deleted_at', null);

      if (voucherError) throw voucherError;

      // Calculate totals
      const totalSales = sales?.reduce((sum, sale) => sum + (sale.net_amount || 0), 0) || 0;
      const totalPaidOnSales = sales?.reduce((sum, sale) => sum + (sale.paid_amount || 0), 0) || 0;
      const totalVoucherPayments = voucherPayments?.reduce((sum, v) => sum + (Number(v.total_amount) || 0), 0) || 0;

      // Total paid = payments on sales + voucher payments (opening balance payments)
      const totalPaid = totalPaidOnSales + totalVoucherPayments;

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
