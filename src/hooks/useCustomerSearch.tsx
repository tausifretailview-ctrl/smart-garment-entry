import { useMemo, useCallback, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

interface Customer {
  id: string;
  customer_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  opening_balance: number | null;
  discount_percent: number | null;
  organization_id: string | null;
}

interface UseCustomerSearchOptions {
  enabled?: boolean;
}

/**
 * Reliable customer search hook with server-side search
 * Handles 2000+ customers efficiently by searching on the server
 */
export const useCustomerSearch = (searchTerm: string = "", options: UseCustomerSearchOptions = {}) => {
  const { currentOrganization } = useOrganization();
  
  // Debounce search term to avoid too many API calls
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms debounce
    
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Normalize phone numbers for search
  const normalizePhone = useCallback((phone: string) => {
    return phone.replace(/\D/g, '');
  }, []);

  // Server-side search query - fetches matching customers from database
  const {
    data: customers = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["customers-search", currentOrganization?.id, debouncedSearchTerm],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const term = debouncedSearchTerm.trim();
      const normalizedPhone = normalizePhone(term);
      
      let query = supabase
        .from("customers")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null);
      
      // If search term exists, filter on server side
      if (term) {
        // Build OR filter for name, phone, and email
        const filters: string[] = [];
        
        // Name search (case insensitive)
        filters.push(`customer_name.ilike.%${term}%`);
        
        // Phone search - search both raw and normalized
        filters.push(`phone.ilike.%${term}%`);
        if (normalizedPhone && normalizedPhone !== term) {
          filters.push(`phone.ilike.%${normalizedPhone}%`);
        }
        
        // Email search
        filters.push(`email.ilike.%${term}%`);
        
        query = query.or(filters.join(','));
      }
      
      // Order and limit results
      const { data, error } = await query
        .order("customer_name")
        .order("id") // Secondary sort for deterministic pagination
        .limit(100); // Return top 100 matches
      
      if (error) {
        console.error("Customer fetch error:", error);
        throw error;
      }
      
      return (data || []) as Customer[];
    },
    enabled: !!currentOrganization?.id && options.enabled !== false,
    staleTime: 30 * 1000, // Cache for 30 seconds
    gcTime: 60 * 1000, // Keep in cache for 1 minute
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  // For server-side search, filteredCustomers = customers (already filtered by server)
  const filteredCustomers = useMemo(() => {
    return customers;
  }, [customers]);
  
  // Indicate if there might be more results beyond the limit
  const hasMore = customers.length >= 100;

  return {
    customers,
    filteredCustomers,
    searchTerm,
    isLoading,
    isError,
    error,
    refetch,
    totalCount: customers.length,
    hasMore,
  };
};

/**
 * Hook to get customer balances for dropdown display
 * Includes both sales.paid_amount and voucher_entries payments for accurate balance
 */
export const useCustomerBalances = () => {
  const { currentOrganization } = useOrganization();

  const { data: customerBalances = {} } = useQuery({
    queryKey: ["customer-balances-search", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return {};
      
      // Fetch all sales with customer_id
      const { data: sales, error: salesError } = await supabase
        .from("sales")
        .select("id, customer_id, net_amount, paid_amount")
        .eq("organization_id", currentOrganization.id)
        .is("deleted_at", null)
        .not("customer_id", "is", null);
      
      if (salesError) throw salesError;
      
      // Fetch all voucher receipt payments
      const { data: vouchers, error: vouchersError } = await supabase
        .from("voucher_entries")
        .select("reference_id, reference_type, total_amount")
        .eq("organization_id", currentOrganization.id)
        .eq("voucher_type", "receipt")
        .is("deleted_at", null);
      
      if (vouchersError) throw vouchersError;

      // Create maps for voucher payments
      // 1. Opening balance payments (reference_type = 'customer', reference_id = customer_id)
      const openingBalancePayments: Record<string, number> = {};
      // 2. Invoice payments (reference_type = 'customer' but reference_id = sale_id)
      const invoiceVoucherPayments: Record<string, number> = {};
      
      // Build sale_id -> customer_id map
      const saleToCustomerMap: Record<string, string> = {};
      sales?.forEach(sale => {
        if (sale.customer_id) {
          saleToCustomerMap[sale.id] = sale.customer_id;
        }
      });

      vouchers?.forEach(v => {
        if (!v.reference_id) return;
        
        // Check if reference_id is a sale_id (invoice payment)
        const customerId = saleToCustomerMap[v.reference_id];
        if (customerId) {
          // This is an invoice payment
          invoiceVoucherPayments[v.reference_id] = (invoiceVoucherPayments[v.reference_id] || 0) + (Number(v.total_amount) || 0);
        } else if (v.reference_type === 'customer') {
          // This is an opening balance payment (reference_id = customer_id)
          openingBalancePayments[v.reference_id] = (openingBalancePayments[v.reference_id] || 0) + (Number(v.total_amount) || 0);
        }
      });
      
      // Aggregate by customer_id
      const balanceMap: Record<string, { totalSales: number; totalPaid: number }> = {};
      sales?.forEach((sale) => {
        if (!sale.customer_id) return;
        if (!balanceMap[sale.customer_id]) {
          balanceMap[sale.customer_id] = { totalSales: 0, totalPaid: 0 };
        }
        balanceMap[sale.customer_id].totalSales += sale.net_amount || 0;
        
        // Use paid_amount from sales (includes at-sale payments)
        // Add voucher payments for this specific invoice to avoid double counting
        const salePaidAmount = sale.paid_amount || 0;
        const invoiceVoucherAmount = invoiceVoucherPayments[sale.id] || 0;
        
        // paid_amount should already include voucher payments after our fix,
        // but for old data, we need to add voucher payments that weren't tracked in paid_amount
        // Use the max of paid_amount or sum (to handle both old and new data)
        balanceMap[sale.customer_id].totalPaid += Math.max(salePaidAmount, invoiceVoucherAmount);
      });

      // Add opening balance payments
      Object.entries(openingBalancePayments).forEach(([customerId, amount]) => {
        if (!balanceMap[customerId]) {
          balanceMap[customerId] = { totalSales: 0, totalPaid: 0 };
        }
        balanceMap[customerId].totalPaid += amount;
      });
      
      return balanceMap;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 30 * 1000, // Reduced stale time for more accurate balances
    refetchOnWindowFocus: true,
  });

  const getCustomerBalance = useCallback((customer: Customer) => {
    const openingBalance = customer.opening_balance || 0;
    const salesData = customerBalances[customer.id] || { totalSales: 0, totalPaid: 0 };
    return openingBalance + salesData.totalSales - salesData.totalPaid;
  }, [customerBalances]);

  return {
    customerBalances,
    getCustomerBalance,
  };
};
