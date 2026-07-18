import { useCallback } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";
import {
  findExactBrandDiscount,
  resolveBrandDiscountForProduct,
} from "@/utils/customerBrandDiscountLookup";

interface BrandDiscount {
  brand: string;
  discount_percent: number;
}

/** React Query key used by Sales Invoice / POS brand-discount lookup. */
export function customerBrandDiscountsMapQueryKey(customerId: string | null | undefined) {
  return ["customer-brand-discounts-map", customerId] as const;
}

/** React Query key used by BrandDiscountDialog list. */
export function customerBrandDiscountsDialogQueryKey(customerId: string | null | undefined) {
  return ["customer-brand-discounts", customerId] as const;
}

/** Invalidate every cache that reads customer_brand_discounts for a customer. */
export function invalidateCustomerBrandDiscountQueries(
  queryClient: QueryClient,
  customerId: string | null | undefined,
) {
  queryClient.invalidateQueries({ queryKey: customerBrandDiscountsDialogQueryKey(customerId) });
  queryClient.invalidateQueries({ queryKey: customerBrandDiscountsMapQueryKey(customerId) });
}

export function useCustomerBrandDiscounts(customerId: string | null) {
  const { currentOrganization } = useOrganization();

  const { data: brandDiscounts = [], isLoading } = useQuery({
    queryKey: customerBrandDiscountsMapQueryKey(customerId),
    queryFn: async () => {
      if (!customerId || !currentOrganization?.id) return [];
      
      const { data, error } = await supabase
        .from("customer_brand_discounts")
        .select("brand, discount_percent")
        .eq("customer_id", customerId)
        .eq("organization_id", currentOrganization.id);
      
      if (error) throw error;
      return (data || []) as BrandDiscount[];
    },
    enabled: !!customerId && !!currentOrganization?.id,
    staleTime: 30000, // Cache for 30 seconds
  });

  // Get discount for a specific brand (0 when not configured or configured at 0%).
  const getBrandDiscount = useCallback((brand: string | null | undefined): number => {
    return findExactBrandDiscount(brandDiscounts, brand) ?? 0;
  }, [brandDiscounts]);

  /**
   * Match product brand field (including intentional 0%), then fall back to
   * tokens in product name only when that brand has no discount row.
   */
  const getBrandDiscountForProduct = useCallback((
    brand: string | null | undefined,
    productName?: string | null,
  ): number => {
    return resolveBrandDiscountForProduct(brandDiscounts, brand, productName);
  }, [brandDiscounts]);

  // Check if customer has any brand discounts configured
  const hasBrandDiscounts = brandDiscounts.length > 0;

  return {
    brandDiscounts,
    getBrandDiscount,
    getBrandDiscountForProduct,
    hasBrandDiscounts,
    isLoading,
  };
}
