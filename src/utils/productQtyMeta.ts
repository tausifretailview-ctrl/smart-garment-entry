import type { SupabaseClient } from "@supabase/supabase-js";

export type ProductQtyMeta = { uom: string; productType: string | null };

/**
 * UOM + product type per product, for lines restored from saved bills
 * (sale_items has neither). Decides whether a line's qty may be a decimal
 * (KG/MTR UOMs and all service products).
 */
export async function fetchProductQtyMeta(
  client: SupabaseClient,
  productIds: Array<string | null | undefined>,
): Promise<Map<string, ProductQtyMeta>> {
  const ids = [...new Set(productIds.map((id) => String(id || "").trim()).filter(Boolean))];
  const map = new Map<string, ProductQtyMeta>();
  if (ids.length === 0) return map;

  const { data, error } = await client.from("products").select("id, uom, product_type").in("id", ids);
  if (error) throw error;

  for (const row of (data || []) as Array<{ id: string; uom?: string | null; product_type?: string | null }>) {
    if (!row?.id) continue;
    map.set(row.id, { uom: row.uom || "NOS", productType: row.product_type || null });
  }
  return map;
}
