 /**
  * Shared utility for consistent customer balance calculation.
  * Uses Math.max(paid_amount, voucher_payments) to handle both:
  * - Old data where paid_amount wasn't updated when voucher was created
  * - New data where paid_amount is properly updated
  */
 
 export interface CustomerBalanceResult {
   balance: number;
   totalSales: number;
   totalPaid: number;
 }
 
 export interface SaleData {
   id: string;
   net_amount: number | null;
   paid_amount: number | null;
 }
 
 /**
  * Calculate customer balance from sales and voucher data.
  * Uses Math.max() to avoid double-counting when voucher payments exist.
  * 
  * @param openingBalance - Customer's opening balance
  * @param sales - Array of sales with id, net_amount, paid_amount
  * @param invoiceVoucherPayments - Map of sale_id -> total voucher payment amount
  * @param openingBalancePayments - Total payments against opening balance (reference_type='customer')
  */
 export function calculateCustomerBalance(
   openingBalance: number,
   sales: SaleData[],
   invoiceVoucherPayments: Map<string, number>,
   openingBalancePayments: number = 0
 ): CustomerBalanceResult {
   let totalSales = 0;
   let totalPaidOnSales = 0;
 
   sales.forEach(sale => {
     totalSales += sale.net_amount || 0;
     const salePaidAmount = sale.paid_amount || 0;
     const voucherAmount = invoiceVoucherPayments.get(sale.id) || 0;
     // Use max to avoid double-counting but also catch old unsynced data
     totalPaidOnSales += Math.max(salePaidAmount, voucherAmount);
   });
 
   const totalPaid = totalPaidOnSales + openingBalancePayments;
   const balance = Math.round(openingBalance + totalSales - totalPaid);
 
   return {
     balance,
     totalSales: Math.round(totalSales),
     totalPaid: Math.round(totalPaid),
   };
 }
 
 /**
  * Build a map of sale_id -> total voucher payment amount from voucher entries.
  * Also returns total opening balance payments for a specific customer.
  */
 export function buildVoucherPaymentMaps(
   voucherEntries: Array<{ reference_id: string | null; reference_type: string | null; total_amount: number | null }>,
   saleIds: string[],
   customerId: string
 ): { invoiceVoucherPayments: Map<string, number>; openingBalancePayments: number } {
   const invoiceVoucherPayments = new Map<string, number>();
   let openingBalancePayments = 0;
   const saleIdSet = new Set(saleIds);
 
   voucherEntries.forEach(v => {
     if (!v.reference_id) return;
     
     // Check if this is a payment for one of this customer's invoices
     if (saleIdSet.has(v.reference_id)) {
       invoiceVoucherPayments.set(
         v.reference_id,
         (invoiceVoucherPayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0)
       );
     } 
     // Check if this is an opening balance payment for this customer
     else if (v.reference_type === 'customer' && v.reference_id === customerId) {
       openingBalancePayments += Number(v.total_amount) || 0;
     }
   });
 
   return { invoiceVoucherPayments, openingBalancePayments };
 }
 
 /**
  * Calculate outstanding per sale using Math.max() logic.
  * Returns a Map of customer_id -> total outstanding balance from invoices.
  */
 export function calculateCustomerInvoiceBalances(
   sales: Array<{ id: string; customer_id: string | null; net_amount: number | null; paid_amount: number | null }>,
   invoiceVoucherPayments: Map<string, number>
 ): Map<string, number> {
   const customerBalances = new Map<string, number>();
   
   sales.forEach(sale => {
     if (sale.customer_id) {
       const salePaidAmount = sale.paid_amount || 0;
       const voucherAmount = invoiceVoucherPayments.get(sale.id) || 0;
       const effectivePaid = Math.max(salePaidAmount, voucherAmount);
       const outstanding = Math.max(0, (sale.net_amount || 0) - effectivePaid);
       
       customerBalances.set(
         sale.customer_id,
         (customerBalances.get(sale.customer_id) || 0) + outstanding
       );
     }
   });
   
   return customerBalances;
 }