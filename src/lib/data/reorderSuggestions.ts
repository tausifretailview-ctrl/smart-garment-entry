/**
 * Reorder by min / max (supermarket phase 2, Nov 2026): get_reorder_suggestions
 * (migration 20270610120000) and grouping by supplier for one purchase order each.
 */
export type ReorderSuggestion = {
  variant_id: string;
  product_id: string;
  product_name: string;
  brand: string | null;
  category: string | null;
  size: string | null;
  color: string | null;
  barcode: string | null;
  uom: string | null;
  pack_unit: string | null;
  pack_factor: number | null;
  reorder_level: number;
  max_stock: number | null;
  product_stock: number;
  variant_stock: number;
  sold_in_period: number;
  suggested_qty: number;
  pur_price: number;
  gst_percent: number;
  hsn_code: string | null;
  supplier_id: string | null;
  supplier_name: string | null;
};

type DbError = { code?: string; message?: string } | null;
export type ReorderDb = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: DbError }>;
};

export function isMissingReorderRpc(err: DbError): boolean {
  if (!err) return false;
  if (err.code === "PGRST202" || err.code === "42883") return true;
  return /get_reorder_suggestions|max_stock/i.test(String(err.message || "")) && /does not exist|schema cache|not find/i.test(String(err.message || ""));
}

/** null while the SQL has not been run. */
export async function fetchReorderSuggestions(db: ReorderDb, orgId: string, periodDays: number): Promise<ReorderSuggestion[] | null> {
  const { data, error } = await db.rpc("get_reorder_suggestions", { p_org_id: orgId, p_period_days: periodDays });
  if (error) {
    if (isMissingReorderRpc(error)) return null;
    throw new Error(error.message || "Could not load reorder list");
  }
  return ((data ?? []) as ReorderSuggestion[]).map((r) => ({
    ...r,
    reorder_level: Number(r.reorder_level) || 0,
    max_stock: r.max_stock == null ? null : Number(r.max_stock),
    product_stock: Number(r.product_stock) || 0,
    variant_stock: Number(r.variant_stock) || 0,
    sold_in_period: Number(r.sold_in_period) || 0,
    suggested_qty: Number(r.suggested_qty) || 0,
    pur_price: Number(r.pur_price) || 0,
    gst_percent: Number(r.gst_percent) || 0,
    pack_factor: r.pack_factor == null ? null : Number(r.pack_factor),
  }));
}

export type SupplierGroup = { key: string; supplierId: string | null; supplierName: string; rows: ReorderSuggestion[] };

/** One group per last supplier; items never bought come last under "No supplier yet". */
export function groupBySupplier(rows: readonly ReorderSuggestion[]): SupplierGroup[] {
  const map = new Map<string, SupplierGroup>();
  for (const r of rows) {
    const key = r.supplier_id ?? "none";
    if (!map.has(key)) {
      map.set(key, { key, supplierId: r.supplier_id, supplierName: r.supplier_name?.trim() || "No supplier yet", rows: [] });
    }
    map.get(key)!.rows.push(r);
  }
  return [...map.values()].sort((a, b) => (a.supplierId ? 0 : 1) - (b.supplierId ? 0 : 1) || a.supplierName.localeCompare(b.supplierName));
}

/** "216 PCS (9 CASE)" — the suggested qty in packs when the item has a pack unit. */
export function packNote(qty: number, packUnit: string | null, factor: number | null): string {
  if (!packUnit || !factor || factor <= 1 || qty <= 0) return "";
  const packs = qty / factor;
  return Number.isInteger(packs) ? `${packs} ${packUnit}` : `${Math.round(packs * 100) / 100} ${packUnit}`;
}
