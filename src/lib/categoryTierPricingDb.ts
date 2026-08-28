import { supabase } from "@/integrations/supabase/client";
import type { CategoryTierRule } from "@/lib/posBilling/categoryTierPricing";

export type CategoryTierPricingRow = {
  id: string;
  organization_id: string;
  category: string;
  single_unit_price: number;
  tier_qty: number;
  tier_total_price: number;
  is_active: boolean;
};

type TierTableQuery = {
  select: (columns?: string) => TierTableQuery;
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => TierTableQuery;
  update: (values: Record<string, unknown>) => TierTableQuery;
  delete: () => TierTableQuery;
  eq: (column: string, value: unknown) => TierTableQuery;
  order: (column: string, options?: { ascending?: boolean }) => TierTableQuery;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: Promise<{ data: unknown; error: { message: string } | null }>["then"];
};

function tierFrom(table: "category_quantity_tier_pricing"): TierTableQuery {
  return (supabase as unknown as { from: (name: string) => TierTableQuery }).from(table);
}

export function mapCategoryTierRow(row: CategoryTierPricingRow): CategoryTierRule & { id: string } {
  return {
    id: row.id,
    category: row.category,
    singleUnitPrice: Number(row.single_unit_price) || 0,
    tierQty: Number(row.tier_qty) || 0,
    tierTotalPrice: Number(row.tier_total_price) || 0,
    isActive: row.is_active !== false,
  };
}

export async function fetchCategoryTierPricingRules(
  organizationId: string,
): Promise<Array<CategoryTierRule & { id: string }>> {
  const { data, error } = await tierFrom("category_quantity_tier_pricing")
    .select("*")
    .eq("organization_id", organizationId)
    .order("category", { ascending: true });
  if (error) throw error;
  return ((data as CategoryTierPricingRow[]) ?? []).map(mapCategoryTierRow);
}

export async function upsertCategoryTierPricingRule(params: {
  organizationId: string;
  id?: string;
  category: string;
  singleUnitPrice: number;
  tierQty: number;
  tierTotalPrice: number;
  isActive: boolean;
}): Promise<void> {
  const payload = {
    organization_id: params.organizationId,
    category: params.category.trim(),
    single_unit_price: params.singleUnitPrice,
    tier_qty: params.tierQty,
    tier_total_price: params.tierTotalPrice,
    is_active: params.isActive,
  };

  if (params.id) {
    const { error } = await tierFrom("category_quantity_tier_pricing")
      .update(payload)
      .eq("id", params.id)
      .eq("organization_id", params.organizationId);
    if (error) throw error;
    return;
  }

  const { error } = await tierFrom("category_quantity_tier_pricing").insert(payload);
  if (error) throw error;
}

export async function deleteCategoryTierPricingRule(
  organizationId: string,
  id: string,
): Promise<void> {
  const { error } = await tierFrom("category_quantity_tier_pricing")
    .delete()
    .eq("id", id)
    .eq("organization_id", organizationId);
  if (error) throw error;
}
