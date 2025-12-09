import { useState, useMemo, useCallback } from "react";
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
  organization_id: string | null;
}

interface UseCustomerSearchOptions {
  enabled?: boolean;
}

/**
 * Reliable customer search hook with improved error handling and caching
 * Uses server-side search for better performance with large datasets
 */
export const useCustomerSearch = (options: UseCustomerSearchOptions = {}) => {
  const { currentOrganization } = useOrganization();
  const [searchTerm, setSearchTerm] = useState("");

  // Main customers query with improved configuration
  const {
    data: customers = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ["customers-search", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from("customers")
        .select("*")
        .eq("organization_id", currentOrganization.id)
        .order("customer_name");
      
      if (error) {
        console.error("Customer fetch error:", error);
        throw error;
      }
      
      return (data || []) as Customer[];
    },
    enabled: !!currentOrganization?.id && options.enabled !== false,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Prevent refetch on window focus
    retry: 3, // Retry 3 times on failure
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000), // Exponential backoff
  });

  // Normalize phone numbers for search
  const normalizePhone = useCallback((phone: string) => {
    return phone.replace(/\D/g, '');
  }, []);

  // Filter customers based on search term (client-side filtering for cached data)
  const filteredCustomers = useMemo(() => {
    if (!searchTerm.trim()) {
      return customers.slice(0, 20); // Return first 20 when no search
    }

    const term = searchTerm.toLowerCase().trim();
    const normalizedSearchPhone = normalizePhone(term);

    return customers
      .filter((customer) => {
        const customerName = customer.customer_name?.toLowerCase() || '';
        const customerPhone = customer.phone || '';
        const normalizedCustomerPhone = normalizePhone(customerPhone);
        const customerEmail = customer.email?.toLowerCase() || '';

        return (
          customerName.includes(term) ||
          customerPhone.toLowerCase().includes(term) ||
          (normalizedSearchPhone && normalizedCustomerPhone.includes(normalizedSearchPhone)) ||
          customerEmail.includes(term)
        );
      })
      .slice(0, 20); // Limit results to 20
  }, [customers, searchTerm, normalizePhone]);

  return {
    customers,
    filteredCustomers,
    searchTerm,
    setSearchTerm,
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
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
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
