import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface CustomerBalanceResult {
  balance: number;
  openingBalance: number;
  totalSales: number;
  totalPaid: number;
  adjustmentTotal: number;
  unusedAdvanceTotal: number;
  saleReturnTotal: number;
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

      // Fetch all sales for this customer (id, net_amount and paid_amount) - exclude cancelled
      const { data: sales, error: salesError } = await supabase
        .from('sales')
        .select('id, net_amount, paid_amount, sale_return_adjust, payment_status')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId)
        .is('deleted_at', null)
        .neq('payment_status', 'cancelled')
        .neq('payment_status', 'hold');

      if (salesError) throw salesError;

      const saleIds = sales?.map(s => s.id) || [];

      // Fetch ALL voucher payments: both opening balance payments AND invoice payments
      const { data: allVouchers, error: voucherError } = await supabase
        .from('voucher_entries')
        .select('reference_id, reference_type, total_amount, payment_method, description')
        .eq('organization_id', organizationId)
        .eq('voucher_type', 'receipt')
        .is('deleted_at', null);

      if (voucherError) throw voucherError;

      // Separate opening balance payments from invoice payments.
      // Per master reconciliation rules, advance-funded and credit-note-adjustment
      // receipts must NOT be counted as cash payments here — advances are subtracted
      // separately via unusedAdvanceTotal logic, and CN-adjustment receipts offset
      // the separately-subtracted saleReturnTotal.
      let openingBalanceVoucherPayments = 0;
      const invoiceVoucherPayments: Record<string, number> = {};
      // Per-sale advance and CN voucher portions, tracked separately:
      //  - advance portion is excluded from cash drift check, then added back to
      //    totalPaid (advances ARE customer payments — they reduce what's owed)
      //  - CN portion is excluded entirely (separately subtracted via saleReturnTotal)
      const invoiceAdvPortions: Record<string, number> = {};
      const invoiceCnPortions: Record<string, number> = {};

      allVouchers?.forEach(v => {
        if (!v.reference_id) return;

        const desc = (v.description || '').toLowerCase();
        const isAdv = v.payment_method === 'advance_adjustment'
          || desc.includes('adjusted from advance balance')
          || desc.includes('advance adjusted');
        const isCn = v.payment_method === 'credit_note_adjustment'
          || desc.includes('credit note adjusted')
          || desc.includes('cn adjusted');

        if (saleIds.includes(v.reference_id)) {
          if (isAdv) {
            invoiceAdvPortions[v.reference_id] = (invoiceAdvPortions[v.reference_id] || 0) + (Number(v.total_amount) || 0);
          } else if (isCn) {
            invoiceCnPortions[v.reference_id] = (invoiceCnPortions[v.reference_id] || 0) + (Number(v.total_amount) || 0);
          } else {
            invoiceVoucherPayments[v.reference_id] = (invoiceVoucherPayments[v.reference_id] || 0) + (Number(v.total_amount) || 0);
          }
        }
        else if (v.reference_type === 'customer' && v.reference_id === customerId) {
          // Skip adv/CN adjustment rows that legacy code wrote with reference_type='customer'
          if (!isAdv && !isCn) {
            openingBalanceVoucherPayments += Number(v.total_amount) || 0;
          }
        }
      });

      // net_amount is already the post-SR-adjustment amount.
      // saleReturnTotal subtracts the sale_return entries separately.
      const totalSales = sales?.reduce((sum, sale) => sum + (sale.net_amount || 0), 0) || 0;
      
      let totalPaidOnSales = 0;
      let totalAdvanceApplied = 0;
      let totalCnApplied = 0;
      sales?.forEach(sale => {
        const salePaidAmount = sale.paid_amount || 0;
        const cashVoucher = invoiceVoucherPayments[sale.id] || 0;
        const advVoucher = invoiceAdvPortions[sale.id] || 0;
        const cnVoucher = invoiceCnPortions[sale.id] || 0;
        const advCnVoucher = advVoucher + cnVoucher;
        // sale.paid_amount typically includes advance + CN portions. Subtract them
        // before the GREATEST drift check so we only count true cash receipts here
        // (advance applied + CN applied are added back below).
        totalPaidOnSales += Math.max(salePaidAmount - advCnVoucher, cashVoucher);
        totalAdvanceApplied += advVoucher;
        totalCnApplied += cnVoucher;
      });

      // net_amount already accounts for CN adjustments at POS save time, so do not
      // add totalCnApplied here (would double-count).
      const totalPaid = totalPaidOnSales + totalAdvanceApplied + openingBalanceVoucherPayments;

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
        .select('id, amount, used_amount')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId)
        .in('status', ['active', 'partially_used']);

      if (advError) throw advError;

      const unusedAdvanceTotal = advances?.reduce((sum, adv) => {
        return sum + Math.max(0, (adv.amount || 0) - (adv.used_amount || 0));
      }, 0) || 0;

      // Fetch advance refunds (refunded advances reduce unused credit)
      const advanceIds = advances?.map(a => a.id) || [];
      let advanceRefundTotal = 0;
      if (advanceIds.length > 0) {
        const { data: advRefunds } = await supabase
          .from('advance_refunds')
          .select('refund_amount')
          .in('advance_id', advanceIds);
        advanceRefundTotal = advRefunds?.reduce((s, r) => s + (r.refund_amount || 0), 0) || 0;
      }

      // Fetch sale returns (credit notes) for this customer
      const { data: saleReturns, error: srError } = await supabase
        .from('sale_returns')
        .select('id, net_amount, credit_status, linked_sale_id')
        .eq('customer_id', customerId)
        .eq('organization_id', organizationId)
        .is('deleted_at', null);

      if (srError) throw srError;

      // Explicitly fetch credits adjusted to outstanding balance.
      // This path can be triggered from Sale Return Dashboard and must always
      // reduce the global outstanding shown in headers/receipts.
      const adjustedOutstandingTotal = saleReturns
        ?.filter((sr: any) => sr.credit_status === 'adjusted_outstanding')
        .reduce((sum: number, sr: any) => sum + (sr.net_amount || 0), 0) || 0;

      // Only actioned returns reduce balance; pending returns are not yet settled.
      // SRs that are 'adjusted' AND linked to a sale are already absorbed into that
      // sale's net_amount via sale_return_adjust at POS save time — don't double-subtract.
      const actionedReturnTotal = saleReturns
        ?.filter((sr: any) => sr.credit_status && sr.credit_status !== 'pending')
        .reduce((sum: number, sr: any) => {
          const alreadyInNet = sr.linked_sale_id && sr.credit_status === 'adjusted';
          return sum + (alreadyInNet ? 0 : (sr.net_amount || 0));
        }, 0) || 0;

      // Keep an explicit term for adjusted_outstanding credits in the final formula
      // (single-source-of-truth requirement for UI header + receipt).
      const saleReturnTotal = Math.max(0, actionedReturnTotal - adjustedOutstandingTotal);

      // Fetch refund payments made to customer (from CN refund)
      const { data: refundVouchers } = await supabase
        .from('voucher_entries')
        .select('total_amount')
        .eq('organization_id', organizationId)
        .eq('voucher_type', 'payment')
        .eq('reference_type', 'customer')
        .eq('reference_id', customerId)
        .is('deleted_at', null);
      const totalRefundsPaid = refundVouchers?.reduce((s, v) => s + (v.total_amount || 0), 0) || 0;

      // Gross Outstanding (before explicit adjusted-outstanding credits)
      // = Opening + Sales - Paid + Adjustments - (Unused Advances - Advance Refunds)
      //   - Other actioned sale returns + Refunds paid out
      const effectiveUnusedAdvances = Math.max(0, unusedAdvanceTotal - advanceRefundTotal);
      const grossOutstanding =
        openingBalance + totalSales - totalPaid + adjustmentTotal - effectiveUnusedAdvances - saleReturnTotal + totalRefundsPaid;
      // Explicit subtraction for returns adjusted directly to outstanding.
      const balance = Math.round(grossOutstanding - adjustedOutstandingTotal);

      return {
        balance,
        openingBalance: Math.round(openingBalance),
        totalSales: Math.round(totalSales),
        totalPaid: Math.round(totalPaid),
        adjustmentTotal: Math.round(adjustmentTotal),
        unusedAdvanceTotal: Math.round(unusedAdvanceTotal),
        saleReturnTotal: Math.round(saleReturnTotal),
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
    saleReturnTotal: data?.saleReturnTotal || 0,
    isLoading,
  };
}
