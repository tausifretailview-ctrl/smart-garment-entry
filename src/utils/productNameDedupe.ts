import { supabase } from "@/integrations/supabase/client";

export type SameNameProductMatch = {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  created_at?: string | null;
  /** Sum of active variant stock. */
  total_stock?: number;
};

export const normalizeProductNameKey = (name: string, category?: string | null): string =>
  `${(name || "").trim().toLowerCase()}|${(category || "").trim().toLowerCase()}`;

/**
 * Name-dupe gate lookup: existing org products whose name AND category match
 * case/whitespace-insensitively. Narrowed server-side with ilike, matched
 * exactly in memory (ilike alone would also match substrings).
 */
export async function findSameNameProductsInOrg(
  organizationId: string,
  name: string,
  category?: string | null,
): Promise<SameNameProductMatch[]> {
  const trimmed = (name || "").trim().replace(/[%_,]/g, "");
  if (!trimmed) return [];
  const { data, error } = await supabase
    .from("products")
    .select("id, product_name, brand, category, created_at, product_variants(stock_qty, deleted_at)")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .ilike("product_name", `%${trimmed}%`)
    .limit(10);
  if (error || !data) return [];
  const want = normalizeProductNameKey(name, category);
  return (data as Array<SameNameProductMatch & { product_variants?: any[] | null }>)
    .filter((p) => normalizeProductNameKey(p.product_name || "", p.category) === want)
    .map(({ product_variants, ...p }) => ({
      ...p,
      total_stock: (product_variants || [])
        .filter((v) => !v.deleted_at)
        .reduce((sum, v) => sum + (Number(v.stock_qty) || 0), 0),
    }));
}

/** Transaction line tables — any row (even on a deleted bill) counts as history. */
const PRODUCT_HISTORY_TABLES = [
  "purchase_items",
  "sale_items",
  "sale_return_items",
  "purchase_return_items",
  "purchase_order_items",
  "quotation_items",
  "sale_order_items",
  "delivery_challan_items",
] as const;

/** True when the product appears on any transaction line. Fails safe (true) on query errors. */
export async function productHasAnyHistory(productId: string): Promise<boolean> {
  const results = await Promise.all(
    PRODUCT_HISTORY_TABLES.map((table) =>
      supabase.from(table).select("id").eq("product_id", productId).limit(1),
    ),
  );
  return results.some((r) => r.error || (r.data && r.data.length > 0));
}

/**
 * Name-dupe gate auto-reuse: when every same-name product is unused (0 stock and
 * no transaction history — usually left by a bill that never saved), return the
 * oldest one to put on the bill without asking. Any stock or history → null, so
 * the "Product already exists?" warning is shown.
 */
export async function pickUnusedSameNameProduct(
  matches: SameNameProductMatch[],
  hasHistory: (productId: string) => Promise<boolean> = productHasAnyHistory,
): Promise<string | null> {
  if (matches.length === 0) return null;
  if (matches.some((m) => (Number(m.total_stock) || 0) !== 0)) return null;
  const history = await Promise.all(matches.map((m) => hasHistory(m.id)));
  if (history.some(Boolean)) return null;
  const oldest = [...matches].sort((a, b) =>
    String(a.created_at || "").localeCompare(String(b.created_at || "")),
  )[0];
  return oldest.id;
}
