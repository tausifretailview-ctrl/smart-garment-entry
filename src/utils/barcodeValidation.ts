import { supabase } from "@/integrations/supabase/client";

/**
 * Check if a barcode already exists in product_variants for the given organization.
 * Optionally exclude a specific variant ID (useful for edit scenarios).
 */
export async function checkBarcodeExists(
  barcode: string,
  organizationId: string,
  excludeVariantId?: string
): Promise<{ exists: boolean; productName?: string }> {
  if (!barcode || !barcode.trim()) {
    return { exists: false };
  }

  let query = supabase
    .from("product_variants")
    .select("id, product_id, products!inner(product_name)")
    .eq("organization_id", organizationId)
    .eq("barcode", barcode.trim())
    .is("deleted_at", null)
    .limit(1);

  if (excludeVariantId) {
    query = query.neq("id", excludeVariantId);
  }

  const { data, error } = await query;

  if (error || !data || data.length === 0) {
    return { exists: false };
  }

  const productName = (data[0] as any)?.products?.product_name || "Unknown Product";
  return { exists: true, productName };
}
