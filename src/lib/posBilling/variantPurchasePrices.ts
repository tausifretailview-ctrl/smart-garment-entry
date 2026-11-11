import type { SupabaseClient } from "@supabase/supabase-js";
import {
  resolvePurchaseCodeDiscount,
  resolvePurchaseCodeGstPer,
  type PurchaseCodeDiscount,
} from "@/utils/purchaseCodeEncoder";

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

export type VariantPurchaseCodeMeta = { gstPer: number; discount: PurchaseCodeDiscount };

/**
 * Product purchase GST % and purchase discount per variant, for the purchase-code column only
 * (POS cart, POS Dashboard). Cart lines do not carry the purchase discount, and reopened /
 * restored lines carry no purchase GST either, so the code is built from the product row —
 * the same inputs the barcode label uses. Kept out of the cart line on purpose:
 * purchaseGstPer there feeds the garment GST slab.
 */
export async function fetchVariantPurchaseCodeMeta(
  client: SupabaseClient,
  organizationId: string,
  variantIds: string[],
): Promise<Record<string, VariantPurchaseCodeMeta>> {
  const ids = [...new Set(variantIds.map((id) => String(id || "").trim()).filter(Boolean))];
  if (!organizationId || ids.length === 0) return {};

  const { data, error } = await client
    .from("product_variants")
    .select("id, products(purchase_gst_percent, gst_per, purchase_discount_type, purchase_discount_value)")
    .eq("organization_id", organizationId)
    .in("id", ids);

  if (error) throw error;

  const map: Record<string, VariantPurchaseCodeMeta> = {};
  for (const row of (data || []) as Array<{ id?: string; products?: unknown }>) {
    if (!row?.id) continue;
    const product = (Array.isArray(row.products) ? row.products[0] : row.products) as
      | (Parameters<typeof resolvePurchaseCodeGstPer>[0] & Parameters<typeof resolvePurchaseCodeDiscount>[0])
      | undefined;
    map[row.id] = {
      gstPer: resolvePurchaseCodeGstPer(product, 0),
      discount: resolvePurchaseCodeDiscount(product),
    };
  }
  return map;
}
