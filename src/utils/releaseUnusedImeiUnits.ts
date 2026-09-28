import { supabase } from "@/integrations/supabase/client";
import { normalizeBarcodes } from "@/utils/barcodeValidation";

/**
 * Mobile ERP: an IMEI saved on the wrong product (mis-scan) blocks the real
 * phone from being added. When that unit was never used — 0 stock and on no
 * bill, order, return, challan or stock movement — it is safe to free the IMEI
 * by soft-deleting the stray unit, instead of making the user fix it in SQL.
 */

export type ImeiUnitRow = {
  id: string;
  barcode: string | null;
  stock_qty: number | null;
  product_name?: string | null;
};

/** Units that can be released: 0 stock, not referenced anywhere, not kept by the caller. */
export function pickReleasableImeiUnits(
  rows: ImeiUnitRow[],
  usedVariantIds: Set<string>,
  keepVariantIds: Set<string>,
): ImeiUnitRow[] {
  return rows.filter(
    (r) =>
      (Number(r.stock_qty) || 0) === 0 &&
      !usedVariantIds.has(r.id) &&
      !keepVariantIds.has(r.id),
  );
}

/** Tables whose rows mean a variant has been used (stock, bills, orders, returns). */
const USAGE_TABLES: Array<{ table: string; column: string; softDelete: boolean }> = [
  { table: "purchase_items", column: "sku_id", softDelete: true },
  { table: "purchase_return_items", column: "sku_id", softDelete: false },
  { table: "purchase_order_items", column: "variant_id", softDelete: false },
  { table: "sale_items", column: "variant_id", softDelete: false },
  { table: "sale_return_items", column: "variant_id", softDelete: false },
  { table: "sale_order_items", column: "variant_id", softDelete: false },
  { table: "quotation_items", column: "variant_id", softDelete: false },
  { table: "delivery_challan_items", column: "variant_id", softDelete: false },
  { table: "stock_movements", column: "variant_id", softDelete: false },
  { table: "batch_stock", column: "variant_id", softDelete: false },
];

async function findUsedVariantIds(variantIds: string[]): Promise<Set<string>> {
  const used = new Set<string>();
  const results = await Promise.all(
    USAGE_TABLES.map(({ table, column }) =>
      // Any row (even soft-deleted) counts as history — keep the unit.
      (supabase.from(table as never) as any).select(column).in(column, variantIds).limit(1000),
    ),
  );
  for (let i = 0; i < results.length; i++) {
    const { data, error } = results[i] as { data: Record<string, string>[] | null; error: unknown };
    // Unknown table / no access: be safe and treat every candidate as used.
    if (error) return new Set(variantIds);
    const column = USAGE_TABLES[i].column;
    for (const row of data ?? []) {
      if (row[column]) used.add(row[column]);
    }
  }
  return used;
}

/**
 * Soft-delete never-used units holding these IMEIs so they can be saved on the
 * right product. Units in `keepVariantIds` (e.g. lines on the open bill) are
 * never touched. Returns what was released; anything else still blocks.
 */
export async function releaseUnusedImeiUnits(
  barcodes: Array<string | null | undefined>,
  organizationId: string,
  options?: { keepVariantIds?: Array<string | null | undefined>; excludeProductId?: string | null },
): Promise<Array<{ barcode: string; productName: string }>> {
  const cleaned = normalizeBarcodes(barcodes);
  if (!cleaned.length || !organizationId) return [];

  const { data, error } = await supabase
    .from("product_variants")
    .select("id, barcode, stock_qty, product_id, products!inner(product_name)")
    .eq("organization_id", organizationId)
    .in("barcode", cleaned)
    .is("deleted_at", null);
  if (error || !data?.length) return [];

  const rows: ImeiUnitRow[] = data
    .filter((r) => !options?.excludeProductId || r.product_id !== options.excludeProductId)
    .map((r) => ({
      id: r.id,
      barcode: r.barcode,
      stock_qty: r.stock_qty,
      product_name: (r.products as { product_name?: string } | null)?.product_name ?? null,
    }));
  if (!rows.length) return [];

  const keep = new Set((options?.keepVariantIds ?? []).filter(Boolean) as string[]);
  const zeroStock = rows.filter((r) => (Number(r.stock_qty) || 0) === 0 && !keep.has(r.id));
  if (!zeroStock.length) return [];

  const used = await findUsedVariantIds(zeroStock.map((r) => r.id));
  const releasable = pickReleasableImeiUnits(rows, used, keep);
  if (!releasable.length) return [];

  const { data: released, error: updateError } = await supabase
    .from("product_variants")
    .update({ deleted_at: new Date().toISOString(), active: false })
    .in("id", releasable.map((r) => r.id))
    .eq("organization_id", organizationId)
    .eq("stock_qty", 0)
    .is("deleted_at", null)
    .select("id");
  if (updateError) return [];

  const releasedIds = new Set((released ?? []).map((r) => r.id));
  return releasable
    .filter((r) => releasedIds.has(r.id))
    .map((r) => ({ barcode: String(r.barcode || ""), productName: r.product_name || "another product" }));
}

export function formatReleasedImeiMessage(released: Array<{ barcode: string; productName: string }>): string {
  return released.map((r) => `${r.barcode} (was on ${r.productName})`).join(", ");
}
