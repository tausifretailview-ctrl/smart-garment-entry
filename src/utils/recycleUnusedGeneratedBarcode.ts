import { supabase } from "@/integrations/supabase/client";
import { classifyBarcodeSource } from "@/utils/barcodeChecksum";

const IN_QUERY_CHUNK = 100;

export type UnusedGeneratedSkuRow = {
  id: string;
  product_id: string;
  barcode: string | null;
  barcode_source?: string | null;
  size?: string | null;
  color?: string | null;
  stock_qty?: number | null;
};

function normalizeSize(size?: string | null): string {
  return (size || "").trim().toLowerCase();
}

function normalizeColor(color?: string | null): string {
  return (color || "").trim().toLowerCase();
}

export function isGeneratedSeriesBarcode(args: {
  barcode_source?: string | null;
  barcode?: string | null;
}): boolean {
  const source = (args.barcode_source || "").trim().toLowerCase();
  if (source === "external") return false;
  if (source === "generated") return true;
  return classifyBarcodeSource(args.barcode).source === "generated";
}

/** Zero-stock generated SKU that can be reused or recycled — never a universal EAN. */
export function isUnusedGeneratedSkuCandidate(row: {
  barcode_source?: string | null;
  barcode?: string | null;
  stock_qty?: number | null;
}): boolean {
  if ((Number(row.stock_qty) || 0) > 0) return false;
  return isGeneratedSeriesBarcode(row);
}

export function pickLowestUnusedGeneratedSku<T extends { barcode?: string | null }>(
  rows: T[],
): T | null {
  if (rows.length === 0) return null;
  return [...rows].sort((a, b) => {
    const aNum = Number(String(a.barcode || "").trim());
    const bNum = Number(String(b.barcode || "").trim());
    if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) {
      return aNum - bNum;
    }
    return String(a.barcode || "").localeCompare(String(b.barcode || ""));
  })[0];
}

async function fetchSkuIdsWithPostedHistory(
  organizationId: string,
  skuIds: string[],
): Promise<Set<string>> {
  const unique = [...new Set(skuIds.filter(Boolean))];
  if (unique.length === 0) return new Set();

  try {
    const found = new Set<string>();
    for (let i = 0; i < unique.length; i += IN_QUERY_CHUNK) {
      const chunk = unique.slice(i, i + IN_QUERY_CHUNK);
      const [purchaseRows, saleRows] = await Promise.all([
        supabase
          .from("purchase_items")
          .select("sku_id")
          .in("sku_id", chunk)
          .is("deleted_at", null)
          .then(({ data, error }) => {
            if (error) throw error;
            return (data as { sku_id: string | null }[]) ?? [];
          }),
        supabase
          .from("sale_items")
          .select("variant_id")
          .eq("organization_id", organizationId)
          .in("variant_id", chunk)
          .is("deleted_at", null)
          .then(({ data, error }) => {
            if (error) throw error;
            return (data as { variant_id: string | null }[]) ?? [];
          }),
      ]);
      for (const row of purchaseRows) {
        if (row.sku_id) found.add(row.sku_id);
      }
      for (const row of saleRows) {
        if (row.variant_id) found.add(row.variant_id);
      }
    }
    return found;
  } catch {
    return new Set(unique);
  }
}

async function loadZeroStockGeneratedOnProduct(opts: {
  organizationId: string;
  productId: string;
}): Promise<UnusedGeneratedSkuRow[]> {
  const { data, error } = await supabase
    .from("product_variants")
    .select("id, product_id, barcode, barcode_source, size, color, stock_qty")
    .eq("organization_id", opts.organizationId)
    .eq("product_id", opts.productId)
    .is("deleted_at", null)
    .eq("stock_qty", 0);
  if (error) throw error;
  return ((data as UnusedGeneratedSkuRow[]) ?? []).filter((row) =>
    isUnusedGeneratedSkuCandidate(row),
  );
}

/**
 * Reuse a leftover generated SKU (stock 0, never billed) on the same
 * product+size+color instead of burning the next series number.
 * Picks the lowest barcode so 420001730 is taken before 420001732.
 */
export async function findReusableUnusedGeneratedSku(opts: {
  organizationId: string;
  productId: string;
  size?: string | null;
  color?: string | null;
  excludeSkuIds?: string[];
}): Promise<{ id: string; barcode: string } | null> {
  const { organizationId, productId } = opts;
  if (!organizationId || !productId) return null;

  const exclude = new Set((opts.excludeSkuIds || []).filter(Boolean));
  const rows = (await loadZeroStockGeneratedOnProduct({ organizationId, productId })).filter(
    (row) =>
      !exclude.has(row.id) &&
      normalizeSize(row.size) === normalizeSize(opts.size) &&
      normalizeColor(row.color) === normalizeColor(opts.color) &&
      Boolean((row.barcode || "").trim()),
  );
  if (rows.length === 0) return null;

  const history = await fetchSkuIdsWithPostedHistory(
    organizationId,
    rows.map((row) => row.id),
  );
  const unused = rows.filter((row) => !history.has(row.id));
  const picked = pickLowestUnusedGeneratedSku(unused);
  const barcode = (picked?.barcode || "").trim();
  if (!picked || !barcode) return null;
  return { id: picked.id, barcode };
}

/** Soft-delete one unused generated SKU so it no longer occupies the series. */
export async function recycleUnusedGeneratedSku(opts: {
  organizationId: string;
  skuId: string;
  excludeSkuIds?: string[];
}): Promise<boolean> {
  const { organizationId, skuId } = opts;
  if (!organizationId || !skuId) return false;
  if ((opts.excludeSkuIds || []).includes(skuId)) return false;

  const { data, error } = await supabase
    .from("product_variants")
    .select("id, barcode, barcode_source, stock_qty")
    .eq("organization_id", organizationId)
    .eq("id", skuId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error || !data) return false;
  if (!isUnusedGeneratedSkuCandidate(data as UnusedGeneratedSkuRow)) return false;

  const history = await fetchSkuIdsWithPostedHistory(organizationId, [skuId]);
  if (history.has(skuId)) return false;

  const { error: delErr } = await supabase
    .from("product_variants")
    .update({ deleted_at: new Date().toISOString(), active: false } as never)
    .eq("organization_id", organizationId)
    .eq("id", skuId)
    .is("deleted_at", null);
  return !delErr;
}

/**
 * Soft-delete leftover unused generated SKUs on a product (other sizes / extra
 * add-then-remove rows) so they do not block the next series number.
 */
export async function recycleOrphanGeneratedSkusOnProduct(opts: {
  organizationId: string;
  productId: string;
  excludeSkuIds?: string[];
}): Promise<number> {
  const { organizationId, productId } = opts;
  if (!organizationId || !productId) return 0;

  const exclude = new Set((opts.excludeSkuIds || []).filter(Boolean));
  const rows = (await loadZeroStockGeneratedOnProduct({ organizationId, productId })).filter(
    (row) => !exclude.has(row.id),
  );
  if (rows.length === 0) return 0;

  const history = await fetchSkuIdsWithPostedHistory(
    organizationId,
    rows.map((row) => row.id),
  );
  const orphans = rows.filter((row) => !history.has(row.id));
  if (orphans.length === 0) return 0;

  const now = new Date().toISOString();
  let recycled = 0;
  for (const row of orphans) {
    const { error } = await supabase
      .from("product_variants")
      .update({ deleted_at: now, active: false } as never)
      .eq("organization_id", organizationId)
      .eq("id", row.id)
      .is("deleted_at", null);
    if (!error) recycled += 1;
  }
  return recycled;
}
