import { useQuery } from "@tanstack/react-query";
import { fetchCategoryTierPricingRules } from "@/lib/categoryTierPricingDb";

export function useCategoryTierPricingRules(
  organizationId: string | null | undefined,
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["category_tier_pricing", organizationId],
    enabled: Boolean(organizationId) && enabled,
    queryFn: () => fetchCategoryTierPricingRules(organizationId!),
    staleTime: 60_000,
  });
}
