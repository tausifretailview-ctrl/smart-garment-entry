import { supabase } from "@/integrations/supabase/client";
import type { CategoryTierRule } from "@/lib/posBilling/categoryTierPricing";

export type DiscountSchemeRow = {
  id: string;
  organization_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

export type CategoryTierPricingRow = {
  id: string;
  organization_id: string;
  scheme_id: string | null;
  category: string;
  single_unit_price: number;
  tier_qty: number;
  tier_total_price: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type DiscountSchemeRuleHistoryRow = {
  id: string;
  organization_id: string;
  scheme_id: string | null;
  rule_id: string | null;
  action: string;
  category: string | null;
  snapshot: Record<string, unknown>;
  changed_by: string | null;
  created_at: string;
};

type SchemeTable =
  | "discount_schemes"
  | "category_quantity_tier_pricing"
  | "discount_scheme_rule_history";

type SchemeQuery = {
  select: (columns?: string) => SchemeQuery;
  insert: (values: Record<string, unknown> | Record<string, unknown>[]) => SchemeQuery;
  update: (values: Record<string, unknown>) => SchemeQuery;
  delete: () => SchemeQuery;
  eq: (column: string, value: unknown) => SchemeQuery;
  order: (column: string, options?: { ascending?: boolean }) => SchemeQuery;
  limit: (count: number) => SchemeQuery;
  maybeSingle: () => Promise<{ data: unknown; error: { message: string } | null }>;
  single: () => Promise<{ data: unknown; error: { message: string } | null }>;
  then: Promise<{ data: unknown; error: { message: string } | null }>["then"];
};

function schemeFrom(table: SchemeTable): SchemeQuery {
  return (supabase as unknown as { from: (name: string) => SchemeQuery }).from(table);
}

export function mapCategoryTierRow(
  row: CategoryTierPricingRow,
): CategoryTierRule & {
  id: string;
  schemeId: string | null;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: row.id,
    schemeId: row.scheme_id,
    category: row.category,
    singleUnitPrice: Number(row.single_unit_price) || 0,
    tierQty: Number(row.tier_qty) || 0,
    tierTotalPrice: Number(row.tier_total_price) || 0,
    isActive: row.is_active !== false,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchDiscountSchemes(organizationId: string): Promise<DiscountSchemeRow[]> {
  const { data, error } = await schemeFrom("discount_schemes")
    .select("*")
    .eq("organization_id", organizationId)
    .order("is_default", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data as DiscountSchemeRow[]) ?? [];
}

export async function ensureDefaultDiscountScheme(organizationId: string): Promise<DiscountSchemeRow> {
  const existing = await fetchDiscountSchemes(organizationId);
  const found = existing.find((s) => s.is_default);
  if (found) return found;

  const { data, error } = await schemeFrom("discount_schemes")
    .insert({
      organization_id: organizationId,
      name: "Default Scheme",
      description: "Primary category bundle pricing scheme",
      is_active: true,
      is_default: true,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as DiscountSchemeRow;
}

export async function fetchActiveDiscountScheme(
  organizationId: string,
  activeSchemeId?: string | null,
): Promise<DiscountSchemeRow | null> {
  const schemes = await fetchDiscountSchemes(organizationId);
  if (activeSchemeId) {
    const picked = schemes.find((s) => s.id === activeSchemeId);
    if (picked) return picked;
  }
  return schemes.find((s) => s.is_default && s.is_active) ?? schemes.find((s) => s.is_active) ?? null;
}

export async function fetchCategoryTierPricingRules(
  organizationId: string,
  schemeId?: string | null,
): Promise<
  Array<
    CategoryTierRule & {
      id: string;
      schemeId: string | null;
      createdAt: string;
      updatedAt: string;
    }
  >
> {
  let query = schemeFrom("category_quantity_tier_pricing").select("*").eq("organization_id", organizationId);
  if (schemeId) {
    query = query.eq("scheme_id", schemeId);
  }
  const { data, error } = await query
    .order("category", { ascending: true })
    .order("single_unit_price", { ascending: true });
  if (error) throw error;
  return ((data as CategoryTierPricingRow[]) ?? []).map(mapCategoryTierRow);
}

async function appendRuleHistory(params: {
  organizationId: string;
  schemeId: string | null;
  ruleId: string | null;
  action: DiscountSchemeRuleHistoryRow["action"];
  category: string | null;
  snapshot: Record<string, unknown>;
  changedBy?: string | null;
}) {
  const { error } = await schemeFrom("discount_scheme_rule_history").insert({
    organization_id: params.organizationId,
    scheme_id: params.schemeId,
    rule_id: params.ruleId,
    action: params.action,
    category: params.category,
    snapshot: params.snapshot,
    changed_by: params.changedBy ?? null,
  });
  if (error) throw error;
}

export async function upsertCategoryTierPricingRule(params: {
  organizationId: string;
  schemeId: string;
  id?: string;
  category: string;
  singleUnitPrice: number;
  tierQty: number;
  tierTotalPrice: number;
  isActive: boolean;
  changedBy?: string | null;
}): Promise<void> {
  const payload = {
    organization_id: params.organizationId,
    scheme_id: params.schemeId,
    category: params.category.trim(),
    single_unit_price: params.singleUnitPrice,
    tier_qty: params.tierQty,
    tier_total_price: params.tierTotalPrice,
    is_active: params.isActive,
  };

  if (params.id) {
    const { error } = await schemeFrom("category_quantity_tier_pricing")
      .update(payload)
      .eq("id", params.id)
      .eq("organization_id", params.organizationId);
    if (error) throw error;
    await appendRuleHistory({
      organizationId: params.organizationId,
      schemeId: params.schemeId,
      ruleId: params.id,
      action: params.isActive ? "updated" : "deactivated",
      category: params.category.trim(),
      snapshot: payload,
      changedBy: params.changedBy,
    });
    return;
  }

  const { error: insertError } = await schemeFrom("category_quantity_tier_pricing").insert(payload);
  if (insertError) throw insertError;

  const { data: created, error: findError } = await schemeFrom("category_quantity_tier_pricing")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("scheme_id", params.schemeId)
    .eq("category", params.category.trim())
    .eq("single_unit_price", params.singleUnitPrice)
    .maybeSingle();
  if (findError) throw findError;

  await appendRuleHistory({
    organizationId: params.organizationId,
    schemeId: params.schemeId,
    ruleId: (created as { id: string } | null)?.id ?? null,
    action: "created",
    category: params.category.trim(),
    snapshot: payload,
    changedBy: params.changedBy,
  });
}

export async function deleteCategoryTierPricingRule(
  organizationId: string,
  rule: { id: string; schemeId: string | null; category: string; snapshot?: Record<string, unknown> },
  changedBy?: string | null,
): Promise<void> {
  const { error } = await schemeFrom("category_quantity_tier_pricing")
    .delete()
    .eq("id", rule.id)
    .eq("organization_id", organizationId);
  if (error) throw error;
  await appendRuleHistory({
    organizationId,
    schemeId: rule.schemeId,
    ruleId: rule.id,
    action: "deleted",
    category: rule.category,
    snapshot: rule.snapshot ?? { id: rule.id, category: rule.category },
    changedBy,
  });
}

export async function fetchDiscountSchemeRuleHistory(
  organizationId: string,
  schemeId?: string | null,
  limit = 100,
): Promise<DiscountSchemeRuleHistoryRow[]> {
  let query = schemeFrom("discount_scheme_rule_history")
    .select("*")
    .eq("organization_id", organizationId);
  if (schemeId) {
    query = query.eq("scheme_id", schemeId);
  }
  const { data, error } = await query.order("created_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return (data as DiscountSchemeRuleHistoryRow[]) ?? [];
}

export async function createDiscountScheme(params: {
  organizationId: string;
  name: string;
  description?: string;
}): Promise<DiscountSchemeRow> {
  const { data, error } = await schemeFrom("discount_schemes")
    .insert({
      organization_id: params.organizationId,
      name: params.name.trim(),
      description: params.description?.trim() || null,
      is_active: true,
      is_default: false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as DiscountSchemeRow;
}
