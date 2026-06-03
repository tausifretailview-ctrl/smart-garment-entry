import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

interface BrandDiscount {
  brand: string;
  discount_percent: number;
}

export function useCustomerBrandDiscounts(customerId: string | null) {
  const { currentOrganization } = useOrganization();

  const { data: brandDiscounts = [], isLoading } = useQuery({
    queryKey: ["customer-brand-discounts-map", customerId],
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

  // Normalize brand strings before comparing: trim, collapse internal whitespace,
  // and lowercase. Without this, a stored brand like "A WALK " (trailing space) or
  // "A  WALK" silently fails to match the product's "A WALK", so the discount is
  // intermittently "not calculated" depending on how the brand was typed.
  const normalizeBrand = (s: string | null | undefined): string =>
    (s || "").trim().toLowerCase().replace(/\s+/g, " ");

  // Get discount for a specific brand
  const getBrandDiscount = (brand: string | null | undefined): number => {
    const target = normalizeBrand(brand);
    if (!target) return 0;
    const discount = brandDiscounts.find(
      (bd) => normalizeBrand(bd.brand) === target
    );
    return discount?.discount_percent || 0;
  };

  // Check if customer has any brand discounts configured
  const hasBrandDiscounts = brandDiscounts.length > 0;

  return {
    brandDiscounts,
    getBrandDiscount,
    hasBrandDiscounts,
    isLoading,
  };
}
