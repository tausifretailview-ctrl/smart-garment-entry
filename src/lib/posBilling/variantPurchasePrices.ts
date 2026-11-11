import type { SupabaseClient } from "@supabase/supabase-js";
import { resolvePurchaseCodeGstPer } from "@/utils/purchaseCodeEncoder";

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

/**
 * Product purchase GST % per variant, for the POS purchase-code column only.
 * Reopened / restored cart lines carry no purchaseGstPer, so with "Include GST in code"
 * on they showed the code without GST while a freshly scanned line (and the label) had it.
 * Kept out of the cart line on purpose: purchaseGstPer there feeds the garment GST slab.
 */
export async function fetchVariantPurchaseCodeGst(
  client: SupabaseClient,
  organizationId: string,
  variantIds: string[],
): Promise<Record<string, number>> {
  const ids = [...new Set(variantIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!organizationId || ids.length === 0) return {};

  const { data, error } = await client
    .from("product_variants")
    .select("id, products(purchase_gst_percent, gst_per)")
    .eq("organization_id", organizationId)
    .in("id", ids);

  if (error) throw error;

  const map: Record<string, number> = {};
  for (const row of (data || []) as Array<{ id?: string; products?: unknown }>) {
    if (!row?.id) continue;
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    map[row.id] = resolvePurchaseCodeGstPer(product as Parameters<typeof resolvePurchaseCodeGstPer>[0], 0);
  }
  return map;
}
