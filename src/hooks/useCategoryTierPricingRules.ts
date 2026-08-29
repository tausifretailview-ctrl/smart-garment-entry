import { useQuery } from "@tanstack/react-query";
import {
  ensureDefaultDiscountScheme,
  fetchActiveDiscountScheme,
  fetchCategoryTierPricingRules,
} from "@/lib/discountSchemeDb";

/** Load tier rules for POS / dashboards — always fetches when org is known (not gated on POS toggle). */
export function useCategoryTierPricingRules(
  organizationId: string | null | undefined,
  activeSchemeId?: string | null,
) {
  return useQuery({
    queryKey: ["category_tier_pricing", organizationId, activeSchemeId ?? "active"],
    enabled: Boolean(organizationId),
    queryFn: async () => {
      const orgId = organizationId!;
      let scheme = await fetchActiveDiscountScheme(orgId, activeSchemeId);
      if (!scheme) {
        scheme = await ensureDefaultDiscountScheme(orgId);
      }
      return fetchCategoryTierPricingRules(orgId, scheme.id);
    },
    staleTime: 30_000,
  });
}
