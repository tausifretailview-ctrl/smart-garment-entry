import { supabase } from "@/integrations/supabase/client";

interface SyncVariantPriceParams {
  barcode: string;
  purPrice: number;
  salePrice: number;
  organizationId: string;
  /** Preferred key — barcode is not org-unique in DB (composite index is product+color+size+barcode). */
  variantId?: string;
}

export async function syncVariantPriceFromPurchase({
  barcode,
  purPrice,
  salePrice,
  organizationId,
  variantId,
}: SyncVariantPriceParams): Promise<void> {
  if (!organizationId) return;
  if (!variantId && !barcode) return;
  if (purPrice <= 0 || salePrice <= 0) return;

  let query = supabase
    .from("product_variants")
    .update({
      pur_price: purPrice,
      sale_price: salePrice,
    })
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (variantId) {
    query = query.eq("id", variantId);
  } else {
    query = query.eq("barcode", barcode);
  }

  const { error } = await query;

  if (error) {
    console.warn(
      "[syncVariantPrice] Failed to sync price for barcode:",
      barcode,
      error.message,
    );
  }
}
