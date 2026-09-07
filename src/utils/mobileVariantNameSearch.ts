import { supabase } from "@/integrations/supabase/client";
import { buildProductTextOrFilter, expandProductSearchTerms } from "@/utils/productSearch";

type VariantRow = { id: string; products?: unknown | null };

/**
 * Org-scoped variant lookup by product name/brand/category/style OR barcode.
 *
 * PostgREST `.or('products.product_name.ilike…')` on `product_variants` does not
 * search the joined product — name queries like "KURTI" returned nothing. Search
 * `products` first, then variants by `product_id` / barcode (same shape as desktop POS).
 */
export async function searchOrgVariantsByNameOrBarcode<T extends VariantRow>(
  orgId: string,
  rawQuery: string,
  variantSelect: string,
  limit = 20,
): Promise<T[]> {
  const term = rawQuery.trim().replace(/[%_,]/g, "");
  if (!orgId || !term) return [];

  const productOr = buildProductTextOrFilter(expandProductSearchTerms(term));

  const productsQuery = supabase
    .from("products")
    .select("id")
    .eq("organization_id", orgId)
    .eq("status", "active")
    .is("deleted_at", null)
    .limit(40);
  const { data: products, error: productError } = productOr
    ? await productsQuery.or(productOr)
    : { data: [] as Array<{ id: string }>, error: null };
  if (productError) throw productError;
  const productIds = (products || []).map((row) => row.id);

  const barcodeQuery = supabase
    .from("product_variants")
    .select(variantSelect)
    .eq("organization_id", orgId)
    .eq("active", true)
    .is("deleted_at", null)
    .ilike("barcode", `%${term}%`)
    .order("stock_qty", { ascending: false })
    .limit(limit);
  const { data: barcodeRows, error: barcodeError } = await barcodeQuery;
  if (barcodeError) throw barcodeError;

  let namedRows: T[] = [];
  if (productIds.length > 0) {
    const { data, error } = await supabase
      .from("product_variants")
      .select(variantSelect)
      .eq("organization_id", orgId)
      .eq("active", true)
      .is("deleted_at", null)
      .in("product_id", productIds)
      .order("stock_qty", { ascending: false })
      .limit(limit);
    if (error) throw error;
    namedRows = (data || []) as unknown as T[];
  }

  const byId = new Map<string, T>();
  for (const row of [...((barcodeRows || []) as unknown as T[]), ...namedRows]) {
    if (row?.id && row.products) byId.set(row.id, row);
  }
  return [...byId.values()].slice(0, limit);
}
