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

  // Get discount for a specific brand
  const getBrandDiscount = (brand: string | null | undefined): number => {
    if (!brand) return 0;
    const discount = brandDiscounts.find(
      (bd) => bd.brand.toLowerCase() === brand.toLowerCase()
    );
    return discount?.discount_percent || 0;
  };

  return {
    brandDiscounts,
    getBrandDiscount,
    isLoading,
  };
}
