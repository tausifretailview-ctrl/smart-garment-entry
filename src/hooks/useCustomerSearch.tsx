import { useMemo, useCallback, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import { STALE_LIVE } from "@/lib/queryStaleTimes";
import { fetchAllCustomers } from "@/utils/fetchAllRows";
import {
  fetchCustomerFinancialSnapshotMap,
  type CustomerFinancialSnapshot,
} from "@/utils/customerFinancialSnapshot";

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

  // Sanitize search term for PostgREST filter syntax
  const sanitizeForPostgREST = useCallback((term: string) => {
    // Escape characters that are special in PostgREST .or() filter syntax
    // Commas separate filters, parentheses group them, backslashes escape
    return term.replace(/[\\,()]/g, '\\$&');
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
        const safeTerm = sanitizeForPostgREST(term);
        
        // Build OR filter for name, phone, and email
        const filters: string[] = [];
        
        // Name search (case insensitive)
        filters.push(`customer_name.ilike.%${safeTerm}%`);
        
        // Phone search - search both raw and normalized
        filters.push(`phone.ilike.%${safeTerm}%`);
        if (normalizedPhone && normalizedPhone !== term) {
          filters.push(`phone.ilike.%${normalizedPhone}%`);
        }
        
        // Email search
        filters.push(`email.ilike.%${safeTerm}%`);
        
        query = query.or(filters.join(','));
      }
      
      // Order and limit results
      const { data, error: queryError } = await query
        .order("customer_name")
        .order("id") // Secondary sort for deterministic pagination
        .limit(201); // Fetch 201 to detect if more results exist
      
      if (queryError) {
        console.error("Customer fetch error:", queryError);
        
        // Fallback: if .or() filter broke, retry with simple name-only search
        if (term) {
          console.warn("Retrying with simple name search fallback");
          const { data: fallbackData, error: fallbackError } = await supabase
            .from("customers")
            .select("*")
            .eq("organization_id", currentOrganization.id)
            .is("deleted_at", null)
            .ilike("customer_name", `%${term}%`)
            .order("customer_name")
            .limit(201);
          
          if (fallbackError) throw fallbackError;
          return (fallbackData || []) as Customer[];
        }
        throw queryError;
      }
      
      // If .or() returned 0 results but we had a search term, try fallback
      if (term && (!data || data.length === 0)) {
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("customers")
          .select("*")
          .eq("organization_id", currentOrganization.id)
          .is("deleted_at", null)
          .ilike("customer_name", `%${term}%`)
          .order("customer_name")
          .limit(201);
        
        if (!fallbackError && fallbackData && fallbackData.length > 0) {
          return fallbackData as Customer[];
        }
      }
      
      return (data || []) as Customer[];
    },
    enabled: !!currentOrganization?.id && options.enabled !== false,
    staleTime: STALE_LIVE,
    gcTime: 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });

  // Detect hasMore from the extra row, then trim to display limit
  const hasMore = customers.length > 200;
  
  const filteredCustomers = useMemo(() => {
    return hasMore ? customers.slice(0, 200) : customers;
  }, [customers, hasMore]);

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
 * Hook to get customer balances and advance amounts for dropdown display.
 * Outstanding Dr uses client ledger math (matches Customer Ledger / useCustomerBalance).
 * Advance/CN from financial snapshot RPC.
 */
export const useCustomerBalances = (options?: { enabled?: boolean }) => {
  const { currentOrganization } = useOrganization();
  const queryEnabled = options?.enabled ?? true;

  const {
    data: snapshotByCustomerId = {},
    isLoading: balancesLoading,
    isFetching: balancesFetching,
  } = useQuery({
    queryKey: ["customer-balances-search", currentOrganization?.id],
    queryFn: async () => {
      if (!currentOrganization?.id) return {} as Record<string, CustomerFinancialSnapshot>;

      const rows = await fetchAllCustomers(currentOrganization.id);
      const ids = rows.map((c: { id: string }) => c.id).filter(Boolean);
      const snapshotMap = await fetchCustomerFinancialSnapshotMap(currentOrganization.id, ids);
      const merged: Record<string, CustomerFinancialSnapshot> = {};
      for (const id of ids) {
        merged[id] = snapshotMap.get(id) ?? {
          outstandingDr: 0,
          advanceAvailable: 0,
          cnAvailableTotal: 0,
          cnPendingCount: 0,
        };
      }
      return merged;
    },
    enabled: !!currentOrganization?.id && queryEnabled,
    staleTime: 30 * 1000,
    refetchOnWindowFocus: false,
  });

  const getCustomerBalance = useCallback(
    (customer: Customer) => snapshotByCustomerId[customer.id]?.outstandingDr ?? 0,
    [snapshotByCustomerId],
  );

  const getCustomerAdvance = useCallback(
    (customerId: string) => snapshotByCustomerId[customerId]?.advanceAvailable ?? 0,
    [snapshotByCustomerId],
  );

  const getCustomerCreditNote = useCallback(
    (customerId: string) => snapshotByCustomerId[customerId]?.cnAvailableTotal ?? 0,
    [snapshotByCustomerId],
  );

  const getCustomerSnapshot = useCallback(
    (customerId: string) => snapshotByCustomerId[customerId],
    [snapshotByCustomerId],
  );

  return {
    customerBalances: snapshotByCustomerId,
    balancesLoading,
    balancesFetching,
    getCustomerBalance,
    getCustomerAdvance,
    getCustomerCreditNote,
    getCustomerSnapshot,
  };
};
