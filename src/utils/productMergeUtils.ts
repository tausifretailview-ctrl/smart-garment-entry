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

export type ConsolidateConflictVariant = {
  variantId: string;
  barcode: string | null;
  size: string | null;
  color: string | null;
  stockQty: number;
};

export type ConsolidateProductsConflict = {
  duplicateProductId?: string;
  canonicalProductId?: string;
  canonicalName?: string;
  conflictingVariants: ConsolidateConflictVariant[];
};

export type ConsolidateProductsResult = {
  groupsMerged: number;
  variantsMoved: number;
  productsRetired: number;
  conflicts: ConsolidateProductsConflict[];
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
 * Exported for unit tests — must match consolidate_duplicate_products SQL.
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
 * Group products by compact name key; only groups with 2+ distinct products.
 */
export function buildDuplicateProductGroups(rows: ProductScanRow[]): ProductDuplicateGroup[] {
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
    if (list.length < 2) continue;
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
      b.productIds.length - a.productIds.length ||
      a.canonicalName.localeCompare(b.canonicalName),
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

/** Client-side scan for the review UI (RPC does the authoritative merge). */
export async function findDuplicateProductGroups(
  organizationId: string,
): Promise<ProductDuplicateGroup[]> {
  const rows = await fetchOrgProductsForMerge(organizationId);
  return buildDuplicateProductGroups(rows);
}

function mapConflictVariant(raw: Record<string, unknown>): ConsolidateConflictVariant {
  return {
    variantId: String(raw.variant_id ?? raw.variantId ?? ""),
    barcode: (raw.barcode as string | null) ?? null,
    size: (raw.size as string | null) ?? null,
    color: (raw.color as string | null) ?? null,
    stockQty: Number(raw.stock_qty ?? raw.stockQty ?? 0) || 0,
  };
}

export function mapConsolidateProductsResult(data: unknown): ConsolidateProductsResult {
  const raw = (data || {}) as Record<string, unknown>;
  const conflictsRaw = Array.isArray(raw.conflicts) ? raw.conflicts : [];
  return {
    groupsMerged: Number(raw.groups_merged ?? raw.groupsMerged ?? 0) || 0,
    variantsMoved: Number(raw.variants_moved ?? raw.variantsMoved ?? 0) || 0,
    productsRetired: Number(raw.products_retired ?? raw.productsRetired ?? 0) || 0,
    dryRun: Boolean(raw.dry_run ?? raw.dryRun),
    conflicts: conflictsRaw.map((c) => {
      const row = (c || {}) as Record<string, unknown>;
      const variants = Array.isArray(row.conflicting_variants)
        ? row.conflicting_variants
        : Array.isArray(row.conflictingVariants)
          ? row.conflictingVariants
          : [];
      return {
        duplicateProductId: (row.duplicate_product_id ?? row.duplicateProductId) as
          | string
          | undefined,
        canonicalProductId: (row.canonical_product_id ?? row.canonicalProductId) as
          | string
          | undefined,
        canonicalName: (row.canonical_name ?? row.canonicalName) as string | undefined,
        conflictingVariants: variants.map((v) =>
          mapConflictVariant((v || {}) as Record<string, unknown>),
        ),
      };
    }),
  };
}

/**
 * Call consolidate_duplicate_products RPC.
 * dryRun=true (default) reports planned moves/conflicts with no writes.
 */
export async function consolidateDuplicateProducts(
  organizationId: string,
  dryRun = true,
): Promise<ConsolidateProductsResult> {
  const { data, error } = await supabase.rpc(
    "consolidate_duplicate_products" as never,
    {
      p_org_id: organizationId,
      p_dry_run: dryRun,
    } as never,
  );
  if (error) throw error;
  return mapConsolidateProductsResult(data);
}
