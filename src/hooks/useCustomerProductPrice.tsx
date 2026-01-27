import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/contexts/OrganizationContext";

interface CustomerProductPrice {
  lastSalePrice: number;
  lastMrp: number;
  lastSaleDate: Date;
}

export function useCustomerProductPrice(
  customerId: string | null | undefined,
  variantId: string | null | undefined
) {
  const { currentOrganization } = useOrganization();

  const { data, isLoading } = useQuery({
    queryKey: ["customer-product-price", customerId, variantId],
    queryFn: async (): Promise<CustomerProductPrice | null> => {
      if (!customerId || !variantId || !currentOrganization?.id) return null;

      const { data, error } = await supabase
        .from("customer_product_prices")
        .select("last_sale_price, last_mrp, last_sale_date")
        .eq("customer_id", customerId)
        .eq("variant_id", variantId)
        .eq("organization_id", currentOrganization.id)
        .maybeSingle();

      if (error) {
        console.error("Error fetching customer product price:", error);
        return null;
      }

      if (!data) return null;

      return {
        lastSalePrice: Number(data.last_sale_price),
        lastMrp: Number(data.last_mrp),
        lastSaleDate: new Date(data.last_sale_date),
      };
    },
    enabled: !!customerId && !!variantId && !!currentOrganization?.id,
    staleTime: 30000, // Cache for 30 seconds
  });

  return {
    customerPrice: data,
    isLoading,
    hasCustomerPrice: !!data,
  };
}

// Hook to fetch customer price for a specific variant (for use when adding products)
export async function fetchCustomerProductPrice(
  organizationId: string,
  customerId: string,
  variantId: string
): Promise<CustomerProductPrice | null> {
  const { data, error } = await supabase
    .from("customer_product_prices")
    .select("last_sale_price, last_mrp, last_sale_date")
    .eq("customer_id", customerId)
    .eq("variant_id", variantId)
    .eq("organization_id", organizationId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    lastSalePrice: Number(data.last_sale_price),
    lastMrp: Number(data.last_mrp),
    lastSaleDate: new Date(data.last_sale_date),
  };
}
