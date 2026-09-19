import { supabase } from "@/integrations/supabase/client";
import { normalizePricingSaleDiscPercent } from "@/utils/productPricingCalc";

/**
 * Load products.pricing_sale_disc_percent for label items.
 * Isolated from the live variant hydrate so a missing column (migration not
 * applied yet) cannot break barcode/price master lookup.
 */
export async function fetchSaleDiscPercentBySkuId(
  organizationId: string,
  skuIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const ids = [...new Set(skuIds.filter(Boolean))];
  if (!organizationId || ids.length === 0) return map;

  const { data: variants, error: variantErr } = await supabase
    .from("product_variants")
    .select("id, product_id")
    .eq("organization_id", organizationId)
    .in("id", ids);

  if (variantErr || !variants?.length) return map;

  const productIds = [...new Set(variants.map((v) => v.product_id).filter(Boolean))];
  if (productIds.length === 0) return map;

  const { data: products, error: productErr } = await supabase
    .from("products")
    .select("id, pricing_sale_disc_percent")
    .eq("organization_id", organizationId)
    .in("id", productIds);

  if (productErr || !products?.length) return map;

  const byProduct = new Map<string, number>();
  for (const p of products) {
    const n = normalizePricingSaleDiscPercent(
      (p as { pricing_sale_disc_percent?: number | null }).pricing_sale_disc_percent,
    );
    if (n != null) byProduct.set(p.id, n);
  }

  for (const v of variants) {
    const n = byProduct.get(v.product_id);
    if (n != null) map.set(v.id, n);
  }
  return map;
}
