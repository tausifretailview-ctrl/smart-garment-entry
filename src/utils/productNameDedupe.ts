import { supabase } from "@/integrations/supabase/client";
import { cleanProductName, productNameMergeKey } from "@/utils/productNameMerge";
import { compactProductToken } from "@/utils/productSearch";

export type SameNameProductMatch = {
  id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  style?: string | null;
  created_at?: string | null;
  /** Sum of active variant stock. */
  total_stock?: number;
};

export const normalizeProductNameKey = (name: string, category?: string | null): string =>
  `${productNameMergeKey(name)}|${productNameMergeKey(category)}`;

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
    .select("id, product_name, brand, category, style, created_at, product_variants(stock_qty, deleted_at)")
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

const identityPart = (value?: string | null): string => (value || "").trim().toLowerCase();

/**
 * Purchase entry auto-use: a same-name product is the same item only when brand and
 * style also match (blank = blank). Shops name many items alike ("BRA") and tell
 * them apart by brand / style (cup B vs C); those must not be merged. Colour is per
 * size row, so it is matched later on the variant, not here.
 */
export function filterSameProductIdentity<T extends Pick<SameNameProductMatch, "brand" | "style">>(
  matches: T[],
  typed: { brand?: string | null; style?: string | null },
): T[] {
  const brand = identityPart(typed.brand);
  const style = identityPart(typed.style);
  return matches.filter((m) => identityPart(m.brand) === brand && identityPart(m.style) === style);
}

/**
 * Purchase entry: which same-name product to use without asking. The one holding
 * stock is the one in use; ties (e.g. all 0) go to the oldest, same as
 * pickUnusedSameNameProduct. Null only when there are no matches.
 */
export function pickPreferredSameNameProduct(matches: SameNameProductMatch[]): string | null {
  if (matches.length === 0) return null;
  const best = [...matches].sort((a, b) => {
    const byStock = (Number(b.total_stock) || 0) - (Number(a.total_stock) || 0);
    if (byStock !== 0) return byStock;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  })[0];
  return best.id;
}

/**
 * Product-name-only match key: the same product name whatever the case, spaces or
 * symbols (- _ . /) the user typed. "ELN-DUP" = "eln dup" = "ELN.DUP " = "ELN_Dup".
 * Same rule as compactProductNameKey and SQL normalize_product_name_key.
 */
export function productNameMatchKey(name: string | null | undefined): string {
  return compactProductToken(cleanProductName(name));
}

/**
 * ilike pattern that narrows the lookup: every letter of the key, in order, with
 * anything between them — so "ELNDUP" still finds "ELN-DUP" and "eln dup" finds "ELN.DUP".
 * Candidates are then matched exactly on productNameMatchKey.
 */
export function productNameIlikePattern(name: string | null | undefined): string | null {
  const chars = Array.from(productNameMatchKey(name)).filter((c) => !/[%_,\\]/.test(c));
  return chars.length ? `%${chars.join("%")}%` : null;
}

export type ProductNameMatchRow = {
  id: string;
  product_name: string;
  total_stock?: number;
  created_at?: string | null;
};

/**
 * The existing product the typed name means, or null. Rows whose key differs are
 * ignored (ilike also matches longer names); `excludeId` skips the product being
 * renamed. Ties go to the one holding stock, then the oldest.
 */
export function pickCanonicalProductName<T extends ProductNameMatchRow>(
  rows: T[],
  typedName: string,
  excludeId?: string | null,
): T | null {
  const want = productNameMatchKey(typedName);
  if (!want) return null;
  const same = rows.filter((r) => r.id !== excludeId && productNameMatchKey(r.product_name) === want);
  if (same.length === 0) return null;
  return [...same].sort((a, b) => {
    const byStock = (Number(b.total_stock) || 0) - (Number(a.total_stock) || 0);
    if (byStock !== 0) return byStock;
    return String(a.created_at || "").localeCompare(String(b.created_at || ""));
  })[0];
}

/**
 * Existing product with the same name (case / spaces / - _ . / ignored) in the org.
 * Only the product name is compared; brand, category, style and price are not.
 * A lookup error returns null so the caller carries on as before.
 */
export async function findProductNameMatch(
  organizationId: string,
  typedName: string,
  excludeId?: string | null,
): Promise<ProductNameMatchRow | null> {
  const pattern = productNameIlikePattern(typedName);
  if (!organizationId || !pattern) return null;
  const { data, error } = await supabase
    .from("products")
    .select("id, product_name, created_at, product_variants(stock_qty, deleted_at)")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .ilike("product_name", pattern)
    .limit(50);
  if (error || !data) return null;
  const rows = (
    data as Array<
      ProductNameMatchRow & {
        product_variants?: Array<{ stock_qty: number | null; deleted_at: string | null }> | null;
      }
    >
  ).map(
    ({ product_variants, ...p }) => ({
      ...p,
      total_stock: (product_variants || [])
        .filter((v) => !v.deleted_at)
        .reduce((sum, v) => sum + (Number(v.stock_qty) || 0), 0),
    }),
  );
  return pickCanonicalProductName(rows, typedName, excludeId);
}
