import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllCustomers, fetchAllSalesSummary } from "@/utils/fetchAllRows";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowLeft, Download, Phone, Mail, MapPin, IndianRupee, Calendar, FileText, CalendarIcon, CreditCard, Banknote, Wallet, FileDown, Send, MessageCircle } from "lucide-react";
import jsPDF from "jspdf";
import { format } from "date-fns";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWhatsAppSend } from "@/hooks/useWhatsAppSend";
import { useIsMobile } from "@/hooks/use-mobile";

interface CustomerLedgerProps {
  organizationId: string;
  paymentFilter?: string | null;
}

interface Customer {
  id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  opening_balance: number;
  totalSales: number;
  totalPaid: number;
  balance: number;
}

interface Transaction {
  id: string;
  date: string;
  type: 'invoice' | 'payment' | 'advance' | 'adjustment';
  reference: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  paymentStatus?: string;
  paymentBreakdown?: {
    cash?: number;
    card?: number;
    upi?: number;
    method?: string;
  };
}

export function CustomerLedger({ organizationId, paymentFilter }: CustomerLedgerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>(paymentFilter || "all");
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [endDate, setEndDate] = useState<Date | undefined>(undefined);
  const [activeTab, setActiveTab] = useState("transactions");
  
  const isMobile = useIsMobile();
  const { sendWhatsApp } = useWhatsAppSend();

  // Sync external filter with internal state
  useEffect(() => {
    if (paymentFilter !== undefined) {
      setPaymentStatusFilter(paymentFilter || "all");
    }
  }, [paymentFilter]);

  // Fetch all customers with their transaction summary using pagination
  const { data: customers, isLoading } = useQuery({
    queryKey: ["customer-ledger", organizationId],
    queryFn: async () => {
      // Fetch ALL customers using range pagination (bypasses 1000-row limit)
      const customersData = await fetchAllCustomers(organizationId);

      // Fetch ALL sales using range pagination (bypasses 1000-row limit)
      const salesData = await fetchAllSalesSummary(organizationId);

      // Fetch ALL voucher payments (both opening balance and invoice payments)
      const { data: allVouchers, error: voucherError } = await supabase
        .from('voucher_entries')
        .select('reference_id, reference_type, total_amount')
        .eq('organization_id', organizationId)
        .eq('voucher_type', 'receipt')
        .is('deleted_at', null);

      if (voucherError) {
        console.error('Error fetching voucher payments:', voucherError);
      }

      // Build sale_id -> customer_id map for invoice vouchers
      const saleToCustomerMap = new Map<string, string>();
      salesData.forEach((s: any) => {
        if (s.customer_id) {
          saleToCustomerMap.set(s.id, s.customer_id);
        }
      });

      // Separate opening balance payments from invoice payments
      const openingBalancePayments = new Map<string, number>(); // customer_id -> amount
      const invoiceVoucherPayments = new Map<string, number>(); // sale_id -> amount

      allVouchers?.forEach((v: any) => {
        if (!v.reference_id) return;
        
        // Check if this is an invoice payment (reference_type='sale' or reference_id is a sale)
        const customerId = saleToCustomerMap.get(v.reference_id);
        if (v.reference_type === 'sale' || customerId) {
          invoiceVoucherPayments.set(v.reference_id, 
            (invoiceVoucherPayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
        } else if (v.reference_type === 'customer') {
          // This is an opening balance payment (reference_id = customer_id)
          openingBalancePayments.set(v.reference_id, 
            (openingBalancePayments.get(v.reference_id) || 0) + (Number(v.total_amount) || 0));
        }
      });

      console.log(`CustomerLedger: Fetched ${customersData.length} customers, ${salesData.length} sales, ${allVouchers?.length || 0} voucher payments`);

      // Calculate totals per customer using Math.max to avoid double-counting
      const customerTotals = customersData.map((customer: any) => {
        const customerSales = salesData.filter((s: any) => s.customer_id === customer.id);
        const totalSales = customerSales.reduce((sum: number, s: any) => sum + (s.net_amount || 0), 0);
        
        // For each sale, use MAX of paid_amount or voucher payments to avoid double-counting
        let totalPaidOnSales = 0;
        customerSales.forEach((sale: any) => {
          const salePaidAmount = sale.paid_amount || 0;
          const voucherAmount = invoiceVoucherPayments.get(sale.id) || 0;
          totalPaidOnSales += Math.max(salePaidAmount, voucherAmount);
        });
        
        // Add opening balance payments
        const openingBalancePaymentTotal = openingBalancePayments.get(customer.id) || 0;
        const totalPaid = totalPaidOnSales + openingBalancePaymentTotal;
        const openingBalance = customer.opening_balance || 0;
        // Balance = Opening Balance + Total Sales - Total Paid (rounded to whole number)
        const balance = Math.round(openingBalance + totalSales - totalPaid);

        return {
          ...customer,
          opening_balance: Math.round(openingBalance),
          totalSales: Math.round(totalSales),
          totalPaid: Math.round(totalPaid),
          balance,
        };
      });

      return customerTotals;
    },
    enabled: !!organizationId,
  });

  // Fetch detailed transactions for selected customer
  const { data: transactions } = useQuery({
    queryKey: ["customer-transactions", selectedCustomer?.id, startDate, endDate],
    queryFn: async () => {
      if (!selectedCustomer) return [];

      // First, get ALL sales for this customer (without date filter) to get all possible reference_ids
      const { data: allCustomerSales, error: allSalesError } = await supabase
        .from("sales")
        .select("id")
        .eq("customer_id", selectedCustomer.id)
        .is("deleted_at", null);

      if (allSalesError) throw allSalesError;

      const allSaleIds = allCustomerSales?.map(s => s.id) || [];

      // Build date filter for displayed sales
      let salesQuery = supabase
        .from("sales")
        .select("*")
        .eq("customer_id", selectedCustomer.id)
        .is("deleted_at", null);

      // Apply date filters - normalize dates to yyyy-MM-dd format for accurate comparison
      if (startDate) {
        const startDateStr = format(startDate, 'yyyy-MM-dd');
        salesQuery = salesQuery.gte("sale_date", startDateStr);
      }
      if (endDate) {
        const endDateStr = format(endDate, 'yyyy-MM-dd');
        salesQuery = salesQuery.lte("sale_date", endDateStr);
      }

      const { data: salesData, error: salesError } = await salesQuery.order("sale_date", { ascending: true });

      if (salesError) throw salesError;

      // Build voucher query - fetch all payments for ANY of this customer's invoices
      let vouchersQuery = supabase
        .from("voucher_entries")
        .select("*")
        .eq("voucher_type", "receipt")
        .is("deleted_at", null)
        .in("reference_id", allSaleIds.length > 0 ? allSaleIds : ['00000000-0000-0000-0000-000000000000']);

      // Apply date filters to vouchers
      if (startDate) {
        const startDateStr = format(startDate, 'yyyy-MM-dd');
        vouchersQuery = vouchersQuery.gte("voucher_date", startDateStr);
      }
      if (endDate) {
        const endDateStr = format(endDate, 'yyyy-MM-dd');
        vouchersQuery = vouchersQuery.lte("voucher_date", endDateStr);
      }

      const { data: vouchersData, error: vouchersError } = await vouchersQuery.order("voucher_date", { ascending: true });

      if (vouchersError) throw vouchersError;

      // Also fetch opening balance payments (reference_type = 'customer')
      let openingBalanceQuery = supabase
        .from("voucher_entries")
        .select("*")
        .eq("reference_type", "customer")
        .eq("reference_id", selectedCustomer.id)
        .eq("voucher_type", "receipt")
        .is("deleted_at", null);

      if (startDate) {
        openingBalanceQuery = openingBalanceQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        openingBalanceQuery = openingBalanceQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: openingBalancePayments, error: openingError } = await openingBalanceQuery.order("voucher_date", { ascending: true });

      if (openingError) throw openingError;

      // Merge invoice payments and opening balance payments
      const allVouchers = [...(vouchersData || []), ...(openingBalancePayments || [])];

      // Fetch customer advances
      let advancesQuery = supabase
        .from("customer_advances")
        .select("*")
        .eq("customer_id", selectedCustomer.id)
        .eq("organization_id", organizationId);

      if (startDate) {
        advancesQuery = advancesQuery.gte("advance_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        advancesQuery = advancesQuery.lte("advance_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: advancesData, error: advancesError } = await advancesQuery.order("advance_date", { ascending: true });

      if (advancesError) throw advancesError;

      // Fetch balance adjustments
      let adjustmentsQuery = (supabase as any)
        .from("customer_balance_adjustments")
        .select("*")
        .eq("customer_id", selectedCustomer.id)
        .eq("organization_id", organizationId);

      if (startDate) {
        adjustmentsQuery = adjustmentsQuery.gte("adjustment_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        adjustmentsQuery = adjustmentsQuery.lte("adjustment_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: adjustmentsData, error: adjustmentsError } = await adjustmentsQuery.order("created_at", { ascending: true });

      if (adjustmentsError) throw adjustmentsError;

      console.log('Sales for customer:', salesData?.length || 0);
      console.log('All customer sale IDs:', allSaleIds.length);
      console.log('Invoice payments found:', vouchersData?.length || 0);
      console.log('Opening balance payments found:', openingBalancePayments?.length || 0);
      console.log('Advances found:', advancesData?.length || 0);
      console.log('Adjustments found:', adjustmentsData?.length || 0);

      // Calculate total voucher payments per sale to exclude from "payment at sale"
      const voucherPaymentsBySaleId: Record<string, number> = {};
      (vouchersData || []).forEach((voucher) => {
        if (voucher.reference_id) {
          voucherPaymentsBySaleId[voucher.reference_id] = 
            (voucherPaymentsBySaleId[voucher.reference_id] || 0) + (voucher.total_amount || 0);
        }
      });

      // Combine and sort transactions
      const allTransactions: Transaction[] = [];
      
      // Start with opening balance
      const openingBalance = selectedCustomer.opening_balance || 0;
      let runningBalance = openingBalance;

      // Add opening balance as first entry if it exists
      if (openingBalance !== 0) {
        allTransactions.push({
          id: 'opening-balance',
          date: '1900-01-01', // Will be shown as "Opening Balance"
          type: 'invoice',
          reference: 'Opening',
          description: 'Opening Balance (Carried Forward)',
          debit: openingBalance > 0 ? openingBalance : 0,
          credit: openingBalance < 0 ? Math.abs(openingBalance) : 0,
          balance: runningBalance,
        });
      }

      // Merge sales, payments, and advances chronologically
      const combined = [
        ...salesData.map((sale) => ({
          date: sale.sale_date,
          type: 'invoice' as const,
          data: sale,
        })),
        ...allVouchers.map((voucher) => ({
          date: voucher.voucher_date,
          type: 'payment' as const,
          data: voucher,
        })),
        ...(advancesData || []).map((advance) => ({
          date: advance.advance_date,
          type: 'advance' as const,
          data: advance,
        })),
        ...(adjustmentsData || []).map((adj: any) => ({
          date: adj.adjustment_date,
          type: 'adjustment' as const,
          data: adj,
        })),
      ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

      combined.forEach((item) => {
        if (item.type === 'invoice') {
          const sale = item.data as any;
          runningBalance += sale.net_amount;
          
          // Build payment breakdown for display
          const paymentBreakdown: any = {};
          if (sale.cash_amount && sale.cash_amount > 0) paymentBreakdown.cash = sale.cash_amount;
          if (sale.card_amount && sale.card_amount > 0) paymentBreakdown.card = sale.card_amount;
          if (sale.upi_amount && sale.upi_amount > 0) paymentBreakdown.upi = sale.upi_amount;
          
          allTransactions.push({
            id: sale.id,
            date: sale.sale_date,
            type: 'invoice',
            reference: sale.sale_number,
            description: `${sale.sale_type === 'pos' ? 'POS' : 'Invoice'} - ${sale.payment_status}`,
            debit: sale.net_amount,
            credit: 0,
            balance: runningBalance,
            paymentStatus: sale.payment_status,
            paymentBreakdown: Object.keys(paymentBreakdown).length > 0 ? paymentBreakdown : undefined,
          });

          // Calculate "payment at sale" - exclude amounts paid via vouchers (recorded payments)
          // Total paid_amount includes all payments, but voucher payments are recorded separately
          const totalPaidOnSale = sale.paid_amount || 0;
          const voucherPayments = voucherPaymentsBySaleId[sale.id] || 0;
          const paidAtSale = Math.max(0, totalPaidOnSale - voucherPayments);
          
          if (paidAtSale > 0) {
            runningBalance -= paidAtSale;
            
            // Build payment description with breakdown
            const paymentParts: string[] = [];
            if (sale.cash_amount > 0) paymentParts.push(`Cash: ₹${sale.cash_amount.toLocaleString('en-IN')}`);
            if (sale.card_amount > 0) paymentParts.push(`Card: ₹${sale.card_amount.toLocaleString('en-IN')}`);
            if (sale.upi_amount > 0) paymentParts.push(`UPI: ₹${sale.upi_amount.toLocaleString('en-IN')}`);
            
            allTransactions.push({
              id: `${sale.id}-payment-at-sale`,
              date: sale.sale_date,
              type: 'payment',
              reference: sale.sale_number,
              description: `Payment at sale${paymentParts.length > 0 ? ' - ' + paymentParts.join(', ') : ''}`,
              debit: 0,
              credit: paidAtSale,
              balance: runningBalance,
              paymentBreakdown: {
                cash: sale.cash_amount || 0,
                card: sale.card_amount || 0,
                upi: sale.upi_amount || 0,
              },
            });
          }
        } else if (item.type === 'advance') {
          // Handle advance booking entries
          const advance = item.data as any;
          const availableAmount = (advance.amount || 0) - (advance.used_amount || 0);
          
          // Advances reduce the customer's balance (credit)
          runningBalance -= advance.amount;
          
          const paymentMethodText = advance.payment_method 
            ? advance.payment_method.charAt(0).toUpperCase() + advance.payment_method.slice(1)
            : 'Cash';
          
          let description = `Advance Booking - ${paymentMethodText}`;
          if (advance.description) {
            description += ` - ${advance.description}`;
          }
          if (advance.used_amount > 0) {
            description += ` (Used: ₹${advance.used_amount.toLocaleString('en-IN')}, Available: ₹${availableAmount.toLocaleString('en-IN')})`;
          }
          
          allTransactions.push({
            id: advance.id,
            date: advance.advance_date,
            type: 'advance',
            reference: advance.advance_number,
            description: description,
            debit: 0,
            credit: advance.amount,
            balance: runningBalance,
            paymentBreakdown: advance.payment_method ? { method: advance.payment_method } : undefined,
          });
        } else if (item.type === 'adjustment') {
          const adj = item.data as any;
          const outDiff = adj.outstanding_difference || 0;
          const advDiff = adj.advance_difference || 0;
          // Outstanding increase = debit, decrease = credit
          // Advance increase = credit, decrease = debit
          const netDebit = (outDiff > 0 ? outDiff : 0) + (advDiff < 0 ? Math.abs(advDiff) : 0);
          const netCredit = (outDiff < 0 ? Math.abs(outDiff) : 0) + (advDiff > 0 ? advDiff : 0);
          runningBalance += netDebit - netCredit;
          
          allTransactions.push({
            id: adj.id,
            date: adj.adjustment_date,
            type: 'adjustment',
            reference: 'ADJ',
            description: `Balance Adjustment: ${adj.reason}`,
            debit: netDebit,
            credit: netCredit,
            balance: runningBalance,
          });
        } else {
          const voucher = item.data as any;
          const discountAmount = voucher.discount_amount || 0;
          const totalCredit = voucher.total_amount + discountAmount;
          runningBalance -= totalCredit;
          
          // Determine if this is an opening balance payment or invoice payment
          const isOpeningBalancePayment = voucher.reference_type === 'customer';
          const relatedSale = !isOpeningBalancePayment ? salesData.find(s => s.id === voucher.reference_id) : null;
          const invoiceRef = relatedSale ? ` - for ${relatedSale.sale_number}` : '';
          
          // Build description including discount if any
          let description = isOpeningBalancePayment 
            ? (voucher.description || 'Opening balance payment')
            : (voucher.description || 'Payment received') + invoiceRef;
          
          if (discountAmount > 0) {
            description += ` (incl. Discount: ₹${discountAmount.toLocaleString('en-IN')}${voucher.discount_reason ? ` - ${voucher.discount_reason}` : ''})`;
          }
          
          allTransactions.push({
            id: voucher.id,
            date: voucher.voucher_date,
            type: 'payment',
            reference: voucher.voucher_number,
            description: description,
            debit: 0,
            credit: totalCredit,
            balance: runningBalance,
            paymentBreakdown: voucher.metadata?.paymentMethod ? { method: voucher.metadata.paymentMethod } : undefined,
          });
        }
      });

      return allTransactions;
    },
    enabled: !!selectedCustomer?.id,
  });

  // Fetch payment history for selected customer
  const { data: paymentHistory } = useQuery({
    queryKey: ["customer-payment-history", selectedCustomer?.id, startDate, endDate],
    queryFn: async () => {
      if (!selectedCustomer) return [];

      // Get all sales for this customer to get reference IDs
      const { data: customerSales, error: salesError } = await supabase
        .from("sales")
        .select("id, sale_number, net_amount, paid_amount, cash_amount, card_amount, upi_amount, sale_date, payment_method, payment_status")
        .eq("customer_id", selectedCustomer.id)
        .is("deleted_at", null);

      if (salesError) throw salesError;

      const saleIds = customerSales?.map(s => s.id) || [];
      const saleMap = new Map(customerSales?.map(s => [s.id, s]) || []);

      // Fetch voucher payments (recorded via Record Payment)
      let vouchersQuery = supabase
        .from("voucher_entries")
        .select("*")
        .eq("voucher_type", "receipt")
        .is("deleted_at", null)
        .in("reference_id", saleIds.length > 0 ? saleIds : ['00000000-0000-0000-0000-000000000000']);

      if (startDate) {
        vouchersQuery = vouchersQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        vouchersQuery = vouchersQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: vouchersData, error: vouchersError } = await vouchersQuery.order("voucher_date", { ascending: false });

      if (vouchersError) throw vouchersError;

      // Fetch opening balance payments (reference_type = 'customer')
      let openingBalanceQuery = supabase
        .from("voucher_entries")
        .select("*")
        .eq("reference_type", "customer")
        .eq("reference_id", selectedCustomer.id)
        .eq("voucher_type", "receipt")
        .is("deleted_at", null);

      if (startDate) {
        openingBalanceQuery = openingBalanceQuery.gte("voucher_date", format(startDate, 'yyyy-MM-dd'));
      }
      if (endDate) {
        openingBalanceQuery = openingBalanceQuery.lte("voucher_date", format(endDate, 'yyyy-MM-dd'));
      }

      const { data: openingBalancePayments, error: openingError } = await openingBalanceQuery.order("voucher_date", { ascending: false });

      if (openingError) throw openingError;

      // Calculate total voucher payments per sale to exclude from "payment at sale"
      const voucherPaymentsBySaleId: Record<string, number> = {};
      vouchersData?.forEach((voucher) => {
        if (voucher.reference_id) {
          voucherPaymentsBySaleId[voucher.reference_id] = 
            (voucherPaymentsBySaleId[voucher.reference_id] || 0) + (voucher.total_amount || 0);
        }
      });

      // Build payment history list
      const payments: any[] = [];

      // Add payments from voucher entries (invoice payments)
      vouchersData?.forEach((voucher) => {
        const relatedSale = saleMap.get(voucher.reference_id || '');
        payments.push({
          id: voucher.id,
          date: voucher.voucher_date,
          voucherNumber: voucher.voucher_number,
          invoiceNumber: relatedSale?.sale_number || 'N/A',
          invoiceAmount: relatedSale?.net_amount || 0,
          amount: voucher.total_amount,
          method: 'recorded',
          description: voucher.description || 'Payment recorded',
          cash: 0,
          card: 0,
          upi: 0,
          source: 'voucher',
        });
      });

      // Add opening balance payments
      openingBalancePayments?.forEach((voucher) => {
        payments.push({
          id: voucher.id,
          date: voucher.voucher_date,
          voucherNumber: voucher.voucher_number,
          invoiceNumber: 'Opening Balance',
          invoiceAmount: selectedCustomer.opening_balance || 0,
          amount: voucher.total_amount,
          method: 'recorded',
          description: voucher.description || 'Opening balance payment',
          cash: 0,
          card: 0,
          upi: 0,
          source: 'opening_balance',
        });
      });

      // Add payments made at time of sale (exclude amounts paid via vouchers)
      customerSales?.forEach((sale) => {
        const totalPaidOnSale = sale.paid_amount || 0;
        const voucherPayments = voucherPaymentsBySaleId[sale.id] || 0;
        const paidAtSale = Math.max(0, totalPaidOnSale - voucherPayments);
        
        if (paidAtSale > 0) {
          // Check date filter
          if (startDate && new Date(sale.sale_date) < startDate) return;
          if (endDate && new Date(sale.sale_date) > endDate) return;
          
          payments.push({
            id: `${sale.id}-sale-payment`,
            date: sale.sale_date,
            voucherNumber: 'At Sale',
            invoiceNumber: sale.sale_number,
            invoiceAmount: sale.net_amount,
            amount: paidAtSale,
            method: sale.payment_method || 'mixed',
            description: 'Payment at time of sale',
            cash: sale.cash_amount || 0,
            card: sale.card_amount || 0,
            upi: sale.upi_amount || 0,
            source: 'sale',
          });
        }
      });

      // Sort by date descending
      payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      return payments;
    },
    enabled: !!selectedCustomer?.id,
  });

  // Calculate payment summary
  const paymentSummary = useMemo(() => {
    if (!paymentHistory) return { total: 0, cash: 0, card: 0, upi: 0, count: 0 };
    return {
      total: paymentHistory.reduce((sum, p) => sum + (p.amount || 0), 0),
      cash: paymentHistory.reduce((sum, p) => sum + (p.cash || 0), 0),
      card: paymentHistory.reduce((sum, p) => sum + (p.card || 0), 0),
      upi: paymentHistory.reduce((sum, p) => sum + (p.upi || 0), 0),
      count: paymentHistory.length,
    };
  }, [paymentHistory]);

  // Filter customers based on search, payment status, and date range
  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    
    return customers.filter((customer) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = (
        customer.customer_name.toLowerCase().includes(searchLower) ||
        customer.phone?.toLowerCase().includes(searchLower) ||
        customer.email?.toLowerCase().includes(searchLower)
      );

      // Payment status filter
      let matchesPaymentStatus = true;
      if (paymentStatusFilter === "outstanding") {
        matchesPaymentStatus = customer.balance > 0;
      } else if (paymentStatusFilter === "settled") {
        matchesPaymentStatus = customer.balance === 0;
      } else if (paymentStatusFilter === "advance") {
        matchesPaymentStatus = customer.balance < 0;
      }

      return matchesSearch && matchesPaymentStatus;
    });
  }, [customers, searchQuery, paymentStatusFilter]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!filteredCustomers) return { totalCustomers: 0, totalOutstanding: 0, totalReceivable: 0 };
    
    return {
      totalCustomers: filteredCustomers.length,
      totalOutstanding: filteredCustomers.reduce((sum, c) => sum + Math.max(0, c.balance), 0),
      totalReceivable: filteredCustomers.reduce((sum, c) => sum + c.totalSales, 0),
    };
  }, [filteredCustomers]);

  // Calculate transaction totals
  const transactionTotals = useMemo(() => {
    if (!transactions) return { totalDebit: 0, totalCredit: 0 };
    
    return transactions.reduce((acc, t) => ({
      totalDebit: acc.totalDebit + (t.debit || 0),
      totalCredit: acc.totalCredit + (t.credit || 0),
    }), { totalDebit: 0, totalCredit: 0 });
  }, [transactions]);

  // Send ledger summary via WhatsApp
  const handleSendLedgerWhatsApp = useCallback(() => {
    if (!selectedCustomer) return;
    if (!selectedCustomer.phone) {
      return;
    }

    const openingBalance = selectedCustomer.opening_balance || 0;
    const dateRange = (startDate || endDate) 
      ? `\n📅 Period: ${startDate ? format(startDate, "dd MMM yyyy") : "Beginning"} - ${endDate ? format(endDate, "dd MMM yyyy") : "Today"}`
      : "";

    // Build last 5 transactions summary
    const recentTxns = transactions?.slice(-5) || [];
    let txnSummary = "";
    if (recentTxns.length > 0) {
      txnSummary = "\n\n📋 *Recent Transactions:*";
      recentTxns.forEach((t) => {
        const dateStr = t.id === 'opening-balance' ? 'Opening' : format(new Date(t.date), "dd/MM/yy");
        if (t.debit > 0) {
          txnSummary += `\n${dateStr} - ${t.reference}: +₹${Math.round(t.debit).toLocaleString("en-IN")}`;
        } else if (t.credit > 0) {
          txnSummary += `\n${dateStr} - ${t.reference}: -₹${Math.round(t.credit).toLocaleString("en-IN")}`;
        }
      });
    }

    const message = `📊 *Account Statement*

👤 *${selectedCustomer.customer_name}*${dateRange}

💰 Opening Balance: ₹${Math.round(openingBalance).toLocaleString("en-IN")}
📈 Total Sales: ₹${Math.round(selectedCustomer.totalSales).toLocaleString("en-IN")}
✅ Total Paid: ₹${Math.round(selectedCustomer.totalPaid).toLocaleString("en-IN")}
────────────────
💵 *Outstanding: ₹${Math.abs(Math.round(selectedCustomer.balance)).toLocaleString("en-IN")}${selectedCustomer.balance < 0 ? " (Advance)" : ""}*${txnSummary}

Please clear your dues at the earliest. Thank you!`;

    sendWhatsApp(selectedCustomer.phone, message);
  }, [selectedCustomer, transactions, startDate, endDate, sendWhatsApp]);

  const handleExportToExcel = () => {
    if (!selectedCustomer || !transactions) return;

    const exportData = transactions.map((t) => {
      const row: any = {
        Date: t.id === 'opening-balance' ? 'Opening' : format(new Date(t.date), "dd/MM/yyyy"),
        Type: t.type === 'invoice' ? 'Invoice' : 'Payment',
        Reference: t.reference,
        Description: t.description,
        Debit: t.debit > 0 ? t.debit.toFixed(2) : '',
        Credit: t.credit > 0 ? t.credit.toFixed(2) : '',
      };

      // Add payment breakdown columns if available
      if (t.paymentBreakdown) {
        if (t.paymentBreakdown.cash !== undefined && t.paymentBreakdown.cash > 0) {
          row['Cash Amount'] = t.paymentBreakdown.cash.toFixed(2);
        }
        if (t.paymentBreakdown.card !== undefined && t.paymentBreakdown.card > 0) {
          row['Card Amount'] = t.paymentBreakdown.card.toFixed(2);
        }
        if (t.paymentBreakdown.upi !== undefined && t.paymentBreakdown.upi > 0) {
          row['UPI Amount'] = t.paymentBreakdown.upi.toFixed(2);
        }
        if (t.paymentBreakdown.method) {
          row['Payment Method'] = t.paymentBreakdown.method.toUpperCase();
        }
      }

      row.Balance = t.balance.toFixed(2);
      return row;
    });

    // Add totals row
    exportData.push({
      Date: '',
      Type: '',
      Reference: '',
      Description: 'TOTAL',
      Debit: transactionTotals.totalDebit.toFixed(2),
      Credit: transactionTotals.totalCredit.toFixed(2),
      Balance: transactions.length > 0 ? transactions[transactions.length - 1].balance.toFixed(2) : '0.00',
    });

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Customer Ledger");
    XLSX.writeFile(wb, `${selectedCustomer.customer_name}_Ledger_${format(new Date(), "dd-MM-yyyy")}.xlsx`);
  };

  const handleExportToPDF = () => {
    if (!selectedCustomer || !transactions) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 14;
    let yPos = 20;

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Customer Ledger", pageWidth / 2, yPos, { align: "center" });
    yPos += 10;

    // Customer Info
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(selectedCustomer.customer_name, margin, yPos);
    yPos += 6;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    if (selectedCustomer.phone) {
      doc.text(`Phone: ${selectedCustomer.phone}`, margin, yPos);
      yPos += 5;
    }
    if (selectedCustomer.address) {
      doc.text(`Address: ${selectedCustomer.address}`, margin, yPos);
      yPos += 5;
    }

    // Date range if filtered
    if (startDate || endDate) {
      const dateRange = `Period: ${startDate ? format(startDate, "dd MMM yyyy") : "Beginning"} to ${endDate ? format(endDate, "dd MMM yyyy") : "Today"}`;
      doc.text(dateRange, margin, yPos);
      yPos += 5;
    }

    // Outstanding Balance
    doc.setFont("helvetica", "bold");
    const balanceText = `Outstanding Balance: Rs. ${Math.abs(selectedCustomer.balance).toLocaleString("en-IN")}`;
    doc.text(balanceText, pageWidth - margin, yPos, { align: "right" });
    yPos += 10;

    // Table Headers
    const headers = ["Date", "Type", "Reference", "Description", "Debit", "Credit", "Balance"];
    const colWidths = [22, 18, 25, 52, 22, 22, 22];
    
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPos, pageWidth - margin * 2, 8, "F");
    
    doc.setFontSize(8);
    doc.setFont("helvetica", "bold");
    let xPos = margin;
    headers.forEach((header, i) => {
      doc.text(header, xPos + 1, yPos + 5);
      xPos += colWidths[i];
    });
    yPos += 10;

    // Table Rows
    doc.setFont("helvetica", "normal");
    transactions.forEach((t) => {
      if (yPos > 270) {
        doc.addPage();
        yPos = 20;
      }

      xPos = margin;
      const rowData = [
        t.id === 'opening-balance' ? 'Opening' : format(new Date(t.date), "dd/MM/yy"),
        t.type === 'invoice' ? 'Invoice' : 'Payment',
        t.reference,
        t.description.length > 28 ? t.description.substring(0, 28) + "..." : t.description,
        t.debit > 0 ? `Rs. ${Math.round(t.debit).toLocaleString("en-IN")}` : "",
        t.credit > 0 ? `Rs. ${Math.round(t.credit).toLocaleString("en-IN")}` : "",
        `Rs. ${Math.abs(Math.round(t.balance)).toLocaleString("en-IN")}`,
      ];

      rowData.forEach((cell, i) => {
        doc.text(cell, xPos + 1, yPos);
        xPos += colWidths[i];
      });
      yPos += 6;
    });

    // Totals Row
    yPos += 2;
    doc.setFillColor(230, 230, 230);
    doc.rect(margin, yPos - 4, pageWidth - margin * 2, 8, "F");
    
    doc.setFont("helvetica", "bold");
    xPos = margin;
    const totalsData = [
      "",
      "",
      "",
      "TOTAL",
      `Rs. ${Math.round(transactionTotals.totalDebit).toLocaleString("en-IN")}`,
      `Rs. ${Math.round(transactionTotals.totalCredit).toLocaleString("en-IN")}`,
      `Rs. ${transactions.length > 0 ? Math.abs(Math.round(transactions[transactions.length - 1].balance)).toLocaleString("en-IN") : "0"}`,
    ];

    totalsData.forEach((cell, i) => {
      doc.text(cell, xPos + 1, yPos);
      xPos += colWidths[i];
    });

    // Footer
    yPos += 15;
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(`Generated on: ${format(new Date(), "dd MMM yyyy, hh:mm a")}`, margin, yPos);

    doc.save(`${selectedCustomer.customer_name}_Ledger_${format(new Date(), "dd-MM-yyyy")}.pdf`);
  };

  if (selectedCustomer && transactions) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedCustomer(null)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Customers
          </Button>
          
          <div className="flex flex-col md:flex-row items-start md:items-center gap-2 w-full md:w-auto">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[200px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "dd MMM yyyy") : "Start Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[200px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd MMM yyyy") : "End Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {(startDate || endDate) && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStartDate(undefined);
                  setEndDate(undefined);
                }}
              >
                Clear
              </Button>
            )}

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportToExcel}
              className={isMobile ? "flex-1" : ""}
            >
              <Download className="mr-2 h-4 w-4" />
              {isMobile ? "Excel" : "Export Excel"}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={handleExportToPDF}
              className={isMobile ? "flex-1" : ""}
            >
              <FileDown className="mr-2 h-4 w-4" />
              {isMobile ? "PDF" : "Export PDF"}
            </Button>

            {selectedCustomer.phone && (
              <Button
                variant="default"
                size="sm"
                onClick={handleSendLedgerWhatsApp}
                className={cn("bg-green-600 hover:bg-green-700", isMobile ? "flex-1" : "")}
              >
                <MessageCircle className="mr-2 h-4 w-4" />
                {isMobile ? "WhatsApp" : "Send on WhatsApp"}
              </Button>
            )}
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <CardTitle className="text-2xl">{selectedCustomer.customer_name}</CardTitle>
                <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-1">
                      <Phone className="h-3 w-3" />
                      {selectedCustomer.phone}
                    </div>
                  )}
                  {selectedCustomer.email && (
                    <div className="flex items-center gap-1">
                      <Mail className="h-3 w-3" />
                      {selectedCustomer.email}
                    </div>
                  )}
                  {selectedCustomer.address && (
                    <div className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {selectedCustomer.address}
                    </div>
                  )}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-muted-foreground mb-1">Outstanding Balance</div>
                <div className={cn(
                  "text-3xl font-bold",
                  selectedCustomer.balance > 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
                )}>
                  ₹{Math.abs(selectedCustomer.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </div>
                {selectedCustomer.balance > 0 && (
                  <Badge variant="destructive" className="mt-2">Outstanding</Badge>
                )}
                {selectedCustomer.balance < 0 && (
                  <Badge variant="default" className="mt-2 bg-green-600">Advance</Badge>
                )}
                {selectedCustomer.balance === 0 && (
                  <Badge variant="outline" className="mt-2">Settled</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              {selectedCustomer.opening_balance !== 0 && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground mb-1">Opening Balance</div>
                    <div className={cn(
                      "text-2xl font-bold",
                      selectedCustomer.opening_balance > 0 ? "text-orange-600 dark:text-orange-400" : "text-green-600 dark:text-green-400"
                    )}>
                      ₹{Math.abs(selectedCustomer.opening_balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedCustomer.opening_balance > 0 ? "Receivable" : "Advance"}
                    </div>
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Sales</div>
                  <div className="text-2xl font-bold">
                    ₹{selectedCustomer.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Total Paid</div>
                  <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                    ₹{selectedCustomer.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground mb-1">Collection Rate</div>
                  <div className="text-2xl font-bold">
                    {(selectedCustomer.totalSales + Math.max(0, selectedCustomer.opening_balance)) > 0
                      ? ((selectedCustomer.totalPaid / (selectedCustomer.totalSales + Math.max(0, selectedCustomer.opening_balance))) * 100).toFixed(1)
                      : '0.0'}%
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator className="my-6" />

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="transactions" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Transaction History
                </TabsTrigger>
                <TabsTrigger value="payments" className="flex items-center gap-2">
                  <IndianRupee className="h-4 w-4" />
                  Payment History
                </TabsTrigger>
              </TabsList>

              <TabsContent value="transactions">
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Reference</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                        <TableHead className="text-right">Balance</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transactions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No transactions found
                          </TableCell>
                        </TableRow>
                      ) : (
                        transactions.map((transaction) => (
                          <TableRow key={transaction.id} className={transaction.id === 'opening-balance' ? 'bg-muted/50' : ''}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                {transaction.id === 'opening-balance' 
                                  ? <span className="font-semibold">Opening</span>
                                  : format(new Date(transaction.date), "dd MMM yyyy")
                                }
                              </div>
                            </TableCell>
                            <TableCell>
                              {transaction.id === 'opening-balance' ? (
                                <Badge variant="outline" className="bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400">
                                  B/F
                                </Badge>
                              ) : (
                                <div className="flex items-center gap-1">
                                  {transaction.type === 'advance' ? (
                                    <Badge className="bg-primary/20 text-primary border-primary/30">
                                      <Wallet className="h-3 w-3 mr-1" /> ADVANCE
                                    </Badge>
                                  ) : transaction.type === 'adjustment' ? (
                                    <Badge className="bg-orange-500/20 text-orange-700 dark:text-orange-400 border-orange-500/30">
                                      ADJ
                                    </Badge>
                                  ) : (
                                    <Badge variant={transaction.type === 'invoice' ? 'default' : 'secondary'}>
                                      {transaction.type === 'invoice' ? (
                                        <><FileText className="h-3 w-3 mr-1" /> Invoice</>
                                      ) : (
                                        <><IndianRupee className="h-3 w-3 mr-1" /> Payment</>
                                      )}
                                    </Badge>
                                  )}
                                  {transaction.type === 'invoice' && transaction.paymentStatus === 'completed' && (
                                    <Badge className="bg-success text-success-foreground text-xs">PAID</Badge>
                                  )}
                                </div>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{transaction.reference}</TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-muted-foreground">{transaction.description}</div>
                                {transaction.paymentBreakdown && (
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {transaction.paymentBreakdown.cash !== undefined && transaction.paymentBreakdown.cash > 0 && (
                                      <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                                        Cash: ₹{transaction.paymentBreakdown.cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                      </Badge>
                                    )}
                                    {transaction.paymentBreakdown.card !== undefined && transaction.paymentBreakdown.card > 0 && (
                                      <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                                        Card: ₹{transaction.paymentBreakdown.card.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                      </Badge>
                                    )}
                                    {transaction.paymentBreakdown.upi !== undefined && transaction.paymentBreakdown.upi > 0 && (
                                      <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400">
                                        UPI: ₹{transaction.paymentBreakdown.upi.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                      </Badge>
                                    )}
                                    {transaction.paymentBreakdown.method && (
                                      <Badge variant="outline" className="text-xs">
                                        {transaction.paymentBreakdown.method.toUpperCase()}
                                      </Badge>
                                    )}
                                  </div>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {transaction.debit > 0 && (
                                <span className="text-red-600 dark:text-red-400">
                                  ₹{transaction.debit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-medium">
                              {transaction.credit > 0 && (
                                <span className="text-emerald-700 dark:text-emerald-300 font-semibold">
                                  ₹{transaction.credit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className={cn(
                              "text-right font-bold",
                              transaction.balance > 0 ? "text-red-600 dark:text-red-400" : 
                              transaction.balance < 0 ? "text-emerald-700 dark:text-emerald-300" : 
                              "text-foreground"
                            )}>
                              ₹{Math.abs(transaction.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                      {/* Totals Row */}
                      {transactions.length > 0 && (
                        <TableRow className="bg-muted/70 font-bold border-t-2">
                          <TableCell colSpan={4} className="text-right">
                            TOTAL
                          </TableCell>
                          <TableCell className="text-right text-red-600 dark:text-red-400">
                            ₹{transactionTotals.totalDebit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className="text-right text-emerald-700 dark:text-emerald-300 font-semibold">
                            ₹{transactionTotals.totalCredit.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                          <TableCell className={cn(
                            "text-right",
                            transactions[transactions.length - 1].balance > 0 ? "text-red-600 dark:text-red-400" : 
                            transactions[transactions.length - 1].balance < 0 ? "text-emerald-700 dark:text-emerald-300" : 
                            "text-foreground"
                          )}>
                            ₹{Math.abs(transactions[transactions.length - 1].balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>

              <TabsContent value="payments">
                {/* Payment Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-xs text-muted-foreground mb-1">Total Received</div>
                      <div className="text-xl font-bold text-green-600 dark:text-green-400">
                        ₹{paymentSummary.total.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-muted-foreground">{paymentSummary.count} payments</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Banknote className="h-3 w-3" /> Cash
                      </div>
                      <div className="text-xl font-bold text-green-600 dark:text-green-400">
                        ₹{paymentSummary.cash.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <CreditCard className="h-3 w-3" /> Card
                      </div>
                      <div className="text-xl font-bold text-blue-600 dark:text-blue-400">
                        ₹{paymentSummary.card.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                        <Wallet className="h-3 w-3" /> UPI
                      </div>
                      <div className="text-xl font-bold text-purple-600 dark:text-purple-400">
                        ₹{paymentSummary.upi.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-xs text-muted-foreground mb-1">Recorded Separately</div>
                      <div className="text-xl font-bold">
                        ₹{(paymentSummary.total - paymentSummary.cash - paymentSummary.card - paymentSummary.upi).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Voucher No.</TableHead>
                        <TableHead>Invoice No.</TableHead>
                        <TableHead>Invoice Amount</TableHead>
                        <TableHead className="text-right">Cash</TableHead>
                        <TableHead className="text-right">Card</TableHead>
                        <TableHead className="text-right">UPI</TableHead>
                        <TableHead className="text-right">Total Paid</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {!paymentHistory || paymentHistory.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            No payment history found
                          </TableCell>
                        </TableRow>
                      ) : (
                        paymentHistory.map((payment) => (
                          <TableRow key={payment.id}>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Calendar className="h-4 w-4 text-muted-foreground" />
                                {format(new Date(payment.date), "dd MMM yyyy")}
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">
                              {payment.voucherNumber !== '-' ? (
                                <Badge variant="outline" className="bg-primary/10 text-primary">
                                  {payment.voucherNumber}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">At Sale</span>
                              )}
                            </TableCell>
                            <TableCell className="font-mono text-sm">{payment.invoiceNumber}</TableCell>
                            <TableCell>
                              ₹{payment.invoiceAmount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </TableCell>
                            <TableCell className="text-right">
                              {payment.cash > 0 && (
                                <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                                  ₹{payment.cash.toLocaleString("en-IN")}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {payment.card > 0 && (
                                <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400">
                                  ₹{payment.card.toLocaleString("en-IN")}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right">
                              {payment.upi > 0 && (
                                <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-400">
                                  ₹{payment.upi.toLocaleString("en-IN")}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-bold text-green-600 dark:text-green-400">
                              ₹{payment.amount.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setPaymentStatusFilter("all")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Customers</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{summary.totalCustomers}</div>
            <p className="text-xs text-muted-foreground mt-1">Active customer accounts</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setPaymentStatusFilter("outstanding")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Outstanding</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600 dark:text-red-400">
              ₹{summary.totalOutstanding.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Amount pending collection</p>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:shadow-lg transition-shadow"
          onClick={() => setPaymentStatusFilter("all")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Receivable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              ₹{summary.totalReceivable.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Total sales value</p>
          </CardContent>
        </Card>
      </div>

      {/* Customer List */}
      <Card>
        <CardHeader>
          <CardTitle>Customer Ledger</CardTitle>
          <CardDescription>View detailed transaction history for each customer</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-6">
            <div className="relative flex-1 w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Payment Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="outstanding">Outstanding</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
                <SelectItem value="advance">Advance</SelectItem>
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[240px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {startDate ? format(startDate, "dd MMM yyyy") : "Start Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={startDate}
                  onSelect={setStartDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full md:w-[240px] justify-start text-left font-normal">
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {endDate ? format(endDate, "dd MMM yyyy") : "End Date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <CalendarComponent
                  mode="single"
                  selected={endDate}
                  onSelect={setEndDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>

            {(startDate || endDate || paymentStatusFilter !== "all") && (
              <Button
                variant="ghost"
                onClick={() => {
                  setStartDate(undefined);
                  setEndDate(undefined);
                  setPaymentStatusFilter("all");
                }}
                className="w-full md:w-auto"
              >
                Clear Filters
              </Button>
            )}
          </div>

          {/* Mobile Card View */}
          {isMobile ? (
            <div className="space-y-3">
              {isLoading ? (
                <div className="text-center text-muted-foreground py-8">
                  Loading customers...
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="text-center text-muted-foreground py-8">
                  No customers found
                </div>
              ) : (
                filteredCustomers.map((customer) => (
                  <Card 
                    key={customer.id}
                    className="cursor-pointer hover:shadow-md transition-shadow"
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-semibold text-base">{customer.customer_name}</h3>
                          {customer.phone && (
                            <div className="flex items-center gap-1 text-sm text-muted-foreground mt-1">
                              <Phone className="h-3 w-3" />
                              {customer.phone}
                            </div>
                          )}
                        </div>
                        {customer.balance > 0 && (
                          <Badge variant="destructive" className="ml-2">Outstanding</Badge>
                        )}
                        {customer.balance < 0 && (
                          <Badge variant="default" className="bg-green-600 ml-2">Advance</Badge>
                        )}
                        {customer.balance === 0 && (
                          <Badge variant="outline" className="ml-2">Settled</Badge>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-between mt-3 pt-3 border-t">
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Sales</div>
                          <div className="font-medium text-sm">₹{customer.totalSales.toLocaleString("en-IN")}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Paid</div>
                          <div className="font-medium text-sm text-green-600 dark:text-green-400">₹{customer.totalPaid.toLocaleString("en-IN")}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-xs text-muted-foreground">Balance</div>
                          <div className={cn(
                            "font-bold text-sm",
                            customer.balance > 0 ? "text-red-600 dark:text-red-400" : 
                            customer.balance < 0 ? "text-green-600 dark:text-green-400" : 
                            "text-foreground"
                          )}>
                            ₹{Math.abs(customer.balance).toLocaleString("en-IN")}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCustomer(customer);
                          }}
                        >
                          View Ledger
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : (
            /* Desktop Table View */
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer Name</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead className="text-right">Total Sales</TableHead>
                    <TableHead className="text-right">Total Paid</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-center">Status</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Loading customers...
                      </TableCell>
                    </TableRow>
                  ) : filteredCustomers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No customers found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredCustomers.map((customer) => (
                      <TableRow 
                        key={customer.id}
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedCustomer(customer)}
                      >
                        <TableCell className="font-medium">{customer.customer_name}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                            {customer.phone && (
                              <div className="flex items-center gap-1">
                                <Phone className="h-3 w-3" />
                                {customer.phone}
                              </div>
                            )}
                            {customer.email && (
                              <div className="flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {customer.email}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          ₹{customer.totalSales.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-right text-green-600 dark:text-green-400">
                          ₹{customer.totalPaid.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-bold",
                          customer.balance > 0 ? "text-red-600 dark:text-red-400" : 
                          customer.balance < 0 ? "text-green-600 dark:text-green-400" : 
                          "text-foreground"
                        )}>
                          ₹{Math.abs(customer.balance).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell className="text-center">
                          {customer.balance > 0 && (
                            <Badge variant="destructive">Outstanding</Badge>
                          )}
                          {customer.balance < 0 && (
                            <Badge variant="default" className="bg-green-600">Advance</Badge>
                          )}
                          {customer.balance === 0 && (
                            <Badge variant="outline">Settled</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCustomer(customer);
                            }}
                          >
                            View Ledger
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
