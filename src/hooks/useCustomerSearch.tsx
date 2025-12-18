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
        .eq("organization_id", currentOrganization.id);
      
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
        .limit(50); // Return top 50 matches
      
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

  return {
    customers,
    filteredCustomers,
    searchTerm,
    isLoading,
    isError,
    error,
    refetch,
    totalCount: customers.length,
  };
};

/**
 * Hook to get customer balances for dropdown display
 */
export const useCustomerBalances = () => {
  const { currentOrganization } = useOrganization();

  const { data: customerBalances = {} } = useQuery({
    queryKey: ["customer-balances-search", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return {};
      
      const { data: sales, error } = await supabase
        .from("sales")
        .select("customer_id, net_amount, paid_amount")
        .eq("organization_id", currentOrganization.id)
        .not("customer_id", "is", null);
      
      if (error) throw error;
      
      // Aggregate by customer_id
      const balanceMap: Record<string, { totalSales: number; totalPaid: number }> = {};
      sales?.forEach((sale) => {
        if (!sale.customer_id) return;
        if (!balanceMap[sale.customer_id]) {
          balanceMap[sale.customer_id] = { totalSales: 0, totalPaid: 0 };
        }
        balanceMap[sale.customer_id].totalSales += sale.net_amount || 0;
        balanceMap[sale.customer_id].totalPaid += sale.paid_amount || 0;
      });
      
      return balanceMap;
    },
    enabled: !!currentOrganization?.id,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
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
