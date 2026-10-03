import { supabase } from "@/integrations/supabase/client";
import { cleanProductName } from "@/utils/productNameMerge";
import { productNameMatchKey } from "@/utils/productNameDedupe";

/** One product in a look-alike name group (ELN-DUP / ELN-Dup / ELN.DUP). */
export type NameMergeProduct = {
  id: string;
  productName: string;
  brand: string | null;
  style: string | null;
  category: string | null;
  createdAt: string | null;
  stock: number;
  variantCount: number;
};

export type NameMergeGroup = {
  key: string;
  /** Clean spelling the kept product gets. */
  canonical: string;
  products: NameMergeProduct[];
  /** Suggested product to keep: most stock, then most sizes, then oldest. */
  keepId: string;
  /** Suggested to merge into keep: same brand and style (blank = blank). Others start unticked. */
  suggestedSourceIds: string[];
};

const part = (v: string | null | undefined) => (v || "").trim().toLowerCase();

/**
 * Pure grouping (tested): two or more live products whose names are the same once
 * case, spaces and - _ . / are ignored. Products with a different brand or style
 * are listed but not ticked — the user decides (BRA cup B vs cup C are not one item).
 */
export function groupProductsByNameKey(products: NameMergeProduct[]): NameMergeGroup[] {
  const byKey = new Map<string, NameMergeProduct[]>();
  for (const p of products) {
    const key = productNameMatchKey(p.productName);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(p);
    byKey.set(key, list);
  }
  const groups: NameMergeGroup[] = [];
  for (const [key, list] of byKey) {
    if (list.length < 2) continue;
    const sorted = [...list].sort(
      (a, b) =>
        b.stock - a.stock ||
        b.variantCount - a.variantCount ||
        String(a.createdAt || "").localeCompare(String(b.createdAt || "")) ||
        (a.id < b.id ? -1 : 1),
    );
    const keep = sorted[0];
    groups.push({
      key,
      canonical: cleanProductName(keep.productName),
      products: sorted,
      keepId: keep.id,
      suggestedSourceIds: sorted
        .slice(1)
        .filter((p) => part(p.brand) === part(keep.brand) && part(p.style) === part(keep.style))
        .map((p) => p.id),
    });
  }
  return groups.sort(
    (a, b) => b.products.length - a.products.length || a.canonical.localeCompare(b.canonical),
  );
}

const PAGE = 1000;

/** Live products of the org with stock and size counts (paged past the 1000-row cap). */
export async function fetchProductsForNameMerge(organizationId: string): Promise<NameMergeProduct[]> {
  const out: NameMergeProduct[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, brand, style, category, created_at, product_variants(stock_qty, deleted_at)")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of (data ?? []) as Array<{
      id: string;
      product_name: string | null;
      brand: string | null;
      style: string | null;
      category: string | null;
      created_at: string | null;
      product_variants?: Array<{ stock_qty: number | null; deleted_at: string | null }> | null;
    }>) {
      const live = (row.product_variants || []).filter((v) => !v.deleted_at);
      out.push({
        id: row.id,
        productName: row.product_name ?? "",
        brand: row.brand,
        style: row.style,
        category: row.category,
        createdAt: row.created_at,
        stock: live.reduce((s, v) => s + (Number(v.stock_qty) || 0), 0),
        variantCount: live.length,
      });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export async function findNameMergeGroups(organizationId: string): Promise<NameMergeGroup[]> {
  return groupProductsByNameKey(await fetchProductsForNameMerge(organizationId));
}

/**
 * Merge the chosen products into `keepId` with merge_products (moves sizes, stock,
 * bills and history; the source goes to the Recycle Bin), then give the kept
 * product the clean spelling. Stops at the first failure and reports how far it got.
 */
export async function mergeProductsIntoKeep(params: {
  organizationId: string;
  keepId: string;
  sourceIds: string[];
  canonical: string;
}): Promise<{ merged: number }> {
  let merged = 0;
  for (const sourceId of params.sourceIds) {
    if (sourceId === params.keepId) continue;
    const { error } = await supabase.rpc("merge_products", {
      p_target_product_id: params.keepId,
      p_source_product_id: sourceId,
    });
    if (error) {
      throw new Error(
        `Merged ${merged} of ${params.sourceIds.length}. Stopped: ${error.message}`,
      );
    }
    merged++;
  }
  const clean = cleanProductName(params.canonical);
  if (clean) {
    const { error } = await supabase
      .from("products")
      .update({ product_name: clean })
      .eq("id", params.keepId)
      .eq("organization_id", params.organizationId);
    if (error) throw error;
  }
  return { merged };
}
