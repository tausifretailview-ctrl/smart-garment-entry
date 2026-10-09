import { supabase } from "@/integrations/supabase/client";
import { cleanProductName } from "@/utils/productNameMerge";
import { productNameMatchKey } from "@/utils/productNameDedupe";
import { isStatementTimeout } from "@/utils/statementTimeout";

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
const VARIANT_CHUNK = 100;

type ProductRow = {
  id: string;
  product_name: string | null;
  brand: string | null;
  style: string | null;
  category: string | null;
  created_at: string | null;
};

/**
 * Live products of the org (names only, keyset-paged past the 1000-row cap). Sizes
 * are not embedded here: on big catalogs (KS Footwear) the products + every size
 * read per page hit the statement timeout and the scan failed.
 */
async function fetchLiveProductRows(organizationId: string): Promise<ProductRow[]> {
  const out: ProductRow[] = [];
  let afterId: string | null = null;
  for (;;) {
    let q = supabase
      .from("products")
      .select("id, product_name, brand, style, category, created_at")
      .eq("organization_id", organizationId)
      .is("deleted_at", null);
    if (afterId) q = q.gt("id", afterId);
    const { data, error } = await q.order("id", { ascending: true }).limit(PAGE);
    if (error) throw error;
    const rows = (data ?? []) as ProductRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
    afterId = rows[rows.length - 1].id;
  }
  return out;
}

/** Stock and live size count per product, read in small id chunks. */
async function fetchVariantTotals(
  productIds: string[],
): Promise<Map<string, { stock: number; variantCount: number }>> {
  const totals = new Map<string, { stock: number; variantCount: number }>();
  for (let i = 0; i < productIds.length; i += VARIANT_CHUNK) {
    const chunk = productIds.slice(i, i + VARIANT_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("product_variants")
        .select("id, product_id, stock_qty")
        .in("product_id", chunk)
        .is("deleted_at", null)
        .order("id", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw error;
      for (const v of (data ?? []) as Array<{ product_id: string; stock_qty: number | null }>) {
        const t = totals.get(v.product_id) ?? { stock: 0, variantCount: 0 };
        t.stock += Number(v.stock_qty) || 0;
        t.variantCount += 1;
        totals.set(v.product_id, t);
      }
      if (!data || data.length < PAGE) break;
    }
  }
  return totals;
}

/**
 * Live products that share a look-alike name with at least one other product, with
 * stock and size counts. Sizes are read only for those few products, not the whole catalog.
 */
export async function fetchProductsForNameMerge(organizationId: string): Promise<NameMergeProduct[]> {
  const rows = await fetchLiveProductRows(organizationId);
  const keyCount = new Map<string, number>();
  for (const r of rows) {
    const key = productNameMatchKey(r.product_name);
    if (key) keyCount.set(key, (keyCount.get(key) ?? 0) + 1);
  }
  const candidates = rows.filter((r) => (keyCount.get(productNameMatchKey(r.product_name)) ?? 0) >= 2);
  const totals = await fetchVariantTotals(candidates.map((r) => r.id));
  return candidates.map((r) => ({
    id: r.id,
    productName: r.product_name ?? "",
    brand: r.brand,
    style: r.style,
    category: r.category,
    createdAt: r.created_at,
    stock: totals.get(r.id)?.stock ?? 0,
    variantCount: totals.get(r.id)?.variantCount ?? 0,
  }));
}

/** Readable message for a failed scan (Supabase errors are plain objects, not Error). */
export function nameScanErrorMessage(err: unknown): string {
  if (isStatementTimeout(err)) {
    return "Scanning product names took too long. Please try again in a moment.";
  }
  if (err instanceof Error && err.message) return err.message;
  const msg = (err as { message?: unknown } | null)?.message;
  if (typeof msg === "string" && msg.trim()) return `Failed to scan product names: ${msg}`;
  return "Failed to scan product names";
}

export async function findNameMergeGroups(organizationId: string): Promise<NameMergeGroup[]> {
  return groupProductsByNameKey(await fetchProductsForNameMerge(organizationId));
}

/** Merging moves stock and bills and soft-deletes products: admins and managers only (as the DB enforces). */
export function canMergeProducts(role: string | null | undefined): boolean {
  return role === "admin" || role === "manager";
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
  // Every product must be a live product of this organisation before anything moves.
  const ids = [...new Set([params.keepId, ...params.sourceIds])];
  const { data: owned, error: ownErr } = await supabase
    .from("products")
    .select("id")
    .eq("organization_id", params.organizationId)
    .is("deleted_at", null)
    .in("id", ids);
  if (ownErr) throw ownErr;
  if ((owned ?? []).length !== ids.length) {
    throw new Error("Some products are not in this organisation or were already deleted. Refresh and try again.");
  }
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
