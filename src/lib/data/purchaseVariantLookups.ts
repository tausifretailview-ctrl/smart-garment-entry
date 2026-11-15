import { supabase } from "@/integrations/supabase/client";

/**
 * Product / size lookups used by Purchase Entry (Plan Phase 4, S4 + D6).
 *
 * The screen had eight copies of the same variant query with slightly different column lists
 * (one of them did not skip sizes in the recycle bin), and two copies of the product search,
 * one with no row limit. They are here once, with one column list.
 */

const PRODUCT_COLUMNS = `
  id, product_name, brand, category, style, color, hsn_code, gst_per,
  purchase_gst_percent, sale_gst_percent, default_pur_price, default_sale_price,
  size_group_id, purchase_discount_type, purchase_discount_value, uom, requires_imei`;

/**
 * A size row with its product (columns above). Loosely typed: the column list is shared, so the
 * client cannot infer it, and the screen maps these rows into its own ProductVariant shape.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PurchaseVariantRow = any;

const VARIANT_COLUMNS = "id, size, pur_price, sale_price, mrp, barcode, barcode_source, active, color, product_id";

/** Variant + its product; the product must be live (inner join). */
export const PURCHASE_VARIANT_SELECT = `${VARIANT_COLUMNS}, products!inner (${PRODUCT_COLUMNS})`;
/** Variant + its product (left join), for "all sizes of these products". */
const PURCHASE_VARIANT_SELECT_LEFT = `${VARIANT_COLUMNS}, products (${PRODUCT_COLUMNS})`;

/** Most product-name matches a search uses (their ids go into the variant request's URL). */
export const PRODUCT_SEARCH_LIMIT = 200;

export type PurchaseProductMatch = { id: string; size_group_id: string | null; product_name: string };

/** Live products whose name / brand / style (and category, if asked) contain the text. */
export async function searchPurchaseProducts(
  orgId: string,
  query: string,
  opts: { includeCategory?: boolean } = {},
): Promise<PurchaseProductMatch[]> {
  const fields = ["product_name", "brand", "style", ...(opts.includeCategory ? ["category"] : [])];
  const { data, error } = await supabase
    .from("products")
    .select("id, size_group_id, product_name")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .or(fields.map((f) => `${f}.ilike.%${query}%`).join(","))
    .limit(PRODUCT_SEARCH_LIMIT);
  if (error) throw error;
  return (data ?? []) as PurchaseProductMatch[];
}

/**
 * Active live sizes for a search: only `productIds` when the name was typed exactly; else
 * those products' sizes plus barcodes containing the text; else barcodes only.
 */
export async function searchPurchaseVariants(
  orgId: string,
  opts: { query: string; productIds: string[]; exactNameMatch: boolean; limit: number },
): Promise<PurchaseVariantRow[]> {
  const { query, productIds, exactNameMatch, limit } = opts;
  let q = supabase
    .from("product_variants")
    .select(PURCHASE_VARIANT_SELECT)
    .eq("organization_id", orgId)
    .eq("active", true)
    .is("deleted_at", null)
    .is("products.deleted_at", null);
  if (exactNameMatch && productIds.length > 0) {
    q = q.in("product_id", productIds);
  } else if (productIds.length > 0) {
    q = q.or(`barcode.ilike.%${query}%,product_id.in.(${productIds.join(",")})`);
  } else {
    q = q.ilike("barcode", `%${query}%`);
  }
  const { data, error } = await q.limit(limit);
  if (error) throw error;
  return (data ?? []) as PurchaseVariantRow[];
}

/** Active live sizes with exactly this barcode (highest MRP first, at most 50). */
export async function fetchPurchaseVariantsByBarcode(orgId: string, barcode: string): Promise<PurchaseVariantRow[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select(PURCHASE_VARIANT_SELECT)
    .eq("organization_id", orgId)
    .eq("barcode", barcode)
    .is("deleted_at", null)
    .is("products.deleted_at", null)
    .eq("active", true)
    .order("mrp", { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []) as PurchaseVariantRow[];
}

/** One active live size by id, or null. */
export async function fetchPurchaseVariantById(orgId: string, variantId: string): Promise<PurchaseVariantRow | null> {
  const { data, error } = await supabase
    .from("product_variants")
    .select(PURCHASE_VARIANT_SELECT)
    .eq("organization_id", orgId)
    .eq("id", variantId)
    .is("deleted_at", null)
    .is("products.deleted_at", null)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return (data as PurchaseVariantRow) ?? null;
}

/**
 * All sizes of these products that are not in the recycle bin. Active only, or — with
 * `includeNullActive` — also sizes whose active flag was never set (the size-grid path treats
 * those as live).
 */
export async function fetchPurchaseVariantsForProducts(
  orgId: string,
  productIds: string[],
  opts: { includeNullActive?: boolean } = {},
): Promise<PurchaseVariantRow[]> {
  const ids = [...new Set(productIds.filter(Boolean))];
  if (ids.length === 0) return [];
  let q = supabase
    .from("product_variants")
    .select(PURCHASE_VARIANT_SELECT_LEFT)
    .in("product_id", ids)
    .eq("organization_id", orgId)
    .is("deleted_at", null);
  q = opts.includeNullActive ? q.or("active.eq.true,active.is.null") : q.eq("active", true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as PurchaseVariantRow[];
}
