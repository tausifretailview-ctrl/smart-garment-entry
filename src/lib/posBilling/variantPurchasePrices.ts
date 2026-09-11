import type { SupabaseClient } from "@supabase/supabase-js";

/** Current variant purchase cost for POS live margin (edit restore has no purPrice). */
export async function fetchVariantPurchasePrices(
  client: SupabaseClient,
  organizationId: string,
  variantIds: string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(variantIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!organizationId || ids.length === 0) return {};

  const { data, error } = await client
    .from("product_variants")
    .select("id, pur_price")
    .eq("organization_id", organizationId)
    .in("id", ids);

  if (error) throw error;

  const map: Record<string, number> = {};
  for (const row of data || []) {
    if (!row?.id) continue;
    map[row.id] = Number(row.pur_price) || 0;
  }
  return map;
}
