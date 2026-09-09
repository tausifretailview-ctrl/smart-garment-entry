import { supabase } from "@/integrations/supabase/client";
import { compactProductToken } from "@/utils/productSearch";

/** Same compact key as Quick Stock / product search (FLEXI NL ≡ FLEXI /NL). */
export function compactProductNameKey(name: string | null | undefined): string {
  return compactProductToken(name ?? "");
}

export type ProductDuplicateGroup = {
  compactName: string;
  productNames: string[];
  productIds: string[];
  variantCounts: number[];
  canonicalName: string;
};

export type ProductPickerResult = {
  id: string;
  productName: string;
  variantCount: number;
};

export type MergeConflictVariant = {
  variantId: string;
  barcode: string | null;
  size: string | null;
  color: string | null;
  stockQty: number;
};

export type MergeTwoProductsResult = {
  sourceProductId: string;
  targetProductId: string;
  sourceProductName: string;
  targetProductName: string;
  variantsMoved: number;
  sourceRetired: boolean;
  conflictingVariants: MergeConflictVariant[];
  dryRun?: boolean;
};

type ProductScanRow = {
  id: string;
  product_name: string | null;
  created_at: string | null;
  variantCount: number;
};

/**
 * Pick canonical product: most active variants, then oldest created_at, then id.
 */
export function pickCanonicalProductIndex(rows: ProductScanRow[]): number {
  if (rows.length === 0) return -1;
  let best = 0;
  for (let i = 1; i < rows.length; i++) {
    const a = rows[best];
    const b = rows[i];
    if (b.variantCount !== a.variantCount) {
      if (b.variantCount > a.variantCount) best = i;
      continue;
    }
    const aTime = a.created_at || "";
    const bTime = b.created_at || "";
    if (bTime !== aTime) {
      if (bTime < aTime) best = i;
      continue;
    }
    if (b.id < a.id) best = i;
  }
  return best;
}

/**
 * Group products by compact name key.
 * @param exactPairsOnly when true, only return groups with exactly 2 products
 *   (avoids huge collisions like a 155-way "BABA SUIT" name).
 */
export function buildDuplicateProductGroups(
  rows: ProductScanRow[],
  exactPairsOnly = false,
): ProductDuplicateGroup[] {
  const byKey = new Map<string, ProductScanRow[]>();
  for (const row of rows) {
    const name = (row.product_name || "").trim();
    if (!name) continue;
    const key = compactProductNameKey(name);
    if (!key) continue;
    const list = byKey.get(key);
    if (list) list.push(row);
    else byKey.set(key, [row]);
  }

  const groups: ProductDuplicateGroup[] = [];
  for (const [compactName, list] of byKey) {
    if (exactPairsOnly ? list.length !== 2 : list.length < 2) continue;
    const canonicalIdx = pickCanonicalProductIndex(list);
    const ordered = [
      list[canonicalIdx],
      ...list.filter((_, i) => i !== canonicalIdx),
    ];
    groups.push({
      compactName,
      productNames: ordered.map((r) => (r.product_name || "").trim()),
      productIds: ordered.map((r) => r.id),
      variantCounts: ordered.map((r) => r.variantCount),
      canonicalName: (ordered[0].product_name || "").trim(),
    });
  }

  return groups.sort(
    (a, b) =>
      a.canonicalName.localeCompare(b.canonicalName) ||
      b.productIds.length - a.productIds.length,
  );
}

async function fetchOrgProductsForMerge(organizationId: string): Promise<ProductScanRow[]> {
  const products: Array<{ id: string; product_name: string | null; created_at: string | null }> = [];
  const pageSize = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("id, product_name, created_at")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    products.push(...data);
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  const variantCounts = new Map<string, number>();
  offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("product_variants")
      .select("product_id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .eq("active", true)
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!data?.length) break;
    for (const row of data) {
      const pid = row.product_id as string;
      variantCounts.set(pid, (variantCounts.get(pid) || 0) + 1);
    }
    if (data.length < pageSize) break;
    offset += pageSize;
  }

  return products.map((p) => ({
    id: p.id,
    product_name: p.product_name,
    created_at: p.created_at,
    variantCount: variantCounts.get(p.id) || 0,
  }));
}

/** Conservative suggestions: exact pairs only (never multi-way mega groups). */
export async function findSafeMergeSuggestions(
  organizationId: string,
): Promise<ProductDuplicateGroup[]> {
  const rows = await fetchOrgProductsForMerge(organizationId);
  return buildDuplicateProductGroups(rows, true);
}

/** Type-ahead search for the FROM / INTO pickers. */
export async function searchProductsForMerge(
  organizationId: string,
  query: string,
): Promise<ProductPickerResult[]> {
  const term = query.trim();
  if (term.length < 2) return [];
  const safe = term.replace(/[%_,()]/g, " ").trim();
  if (!safe) return [];

  const { data, error } = await supabase
    .from("products")
    .select("id, product_name, product_variants(id, deleted_at, active)")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .ilike("product_name", `%${safe}%`)
    .order("product_name")
    .limit(25);
  if (error) throw error;

  return (data || []).map((p) => {
    const variants = (p.product_variants || []) as Array<{
      id: string;
      deleted_at: string | null;
      active: boolean | null;
    }>;
    const variantCount = variants.filter(
      (v) => !v.deleted_at && v.active !== false,
    ).length;
    return {
      id: p.id as string,
      productName: ((p.product_name as string) || "").trim(),
      variantCount,
    };
  });
}

function mapConflictVariant(raw: Record<string, unknown>): MergeConflictVariant {
  return {
    variantId: String(raw.variant_id ?? raw.variantId ?? ""),
    barcode: (raw.barcode as string | null) ?? null,
    size: (raw.size as string | null) ?? null,
    color: (raw.color as string | null) ?? null,
    stockQty: Number(raw.stock_qty ?? raw.stockQty ?? 0) || 0,
  };
}

export function mapMergeTwoProductsResult(data: unknown): MergeTwoProductsResult {
  const raw = (data || {}) as Record<string, unknown>;
  const conflictsRaw = Array.isArray(raw.conflicting_variants)
    ? raw.conflicting_variants
    : Array.isArray(raw.conflictingVariants)
      ? raw.conflictingVariants
      : [];
  return {
    sourceProductId: String(raw.source_product_id ?? raw.sourceProductId ?? ""),
    targetProductId: String(raw.target_product_id ?? raw.targetProductId ?? ""),
    sourceProductName: String(raw.source_product_name ?? raw.sourceProductName ?? ""),
    targetProductName: String(raw.target_product_name ?? raw.targetProductName ?? ""),
    variantsMoved: Number(raw.variants_moved ?? raw.variantsMoved ?? 0) || 0,
    sourceRetired: Boolean(raw.source_retired ?? raw.sourceRetired),
    dryRun: Boolean(raw.dry_run ?? raw.dryRun),
    conflictingVariants: conflictsRaw.map((v) =>
      mapConflictVariant((v || {}) as Record<string, unknown>),
    ),
  };
}

/**
 * Call merge_two_products RPC.
 * dryRun=true (default) reports planned moves/conflicts with no writes.
 */
export async function mergeTwoProducts(
  organizationId: string,
  sourceProductId: string,
  targetProductId: string,
  dryRun = true,
): Promise<MergeTwoProductsResult> {
  const { data, error } = await supabase.rpc("merge_two_products" as never, {
    p_org_id: organizationId,
    p_source_product_id: sourceProductId,
    p_target_product_id: targetProductId,
    p_dry_run: dryRun,
  } as never);
  if (error) throw error;
  return mapMergeTwoProductsResult(data);
}
