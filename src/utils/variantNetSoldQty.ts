import { supabase } from "@/integrations/supabase/client";
import { fetchInIdBatches } from "@/lib/data/fetchInIdBatches";

/**
 * Net sold qty per variant: SUM(sale_items.quantity) − SUM(sale_return_items.quantity)
 * for non-deleted rows (and non-deleted parent sales / sale_returns).
 *
 * Do NOT use purchased − stock_qty (ignores opening / returns / DC).
 * Do NOT use get_sold_variant_ids (IDs only, no quantities).
 *
 * Prefer RPC `net_sold_qty_for_variant` when available (same formula as the DB stock floor);
 * fall back to client aggregation so edit UX still works before the migration is applied.
 */
export async function getNetSoldQtyByVariantIds(
  variantIds: string[],
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const ids = [...new Set(variantIds.filter(Boolean))];
  if (ids.length === 0) return result;

  for (const id of ids) result.set(id, 0);

  // Try RPC for the first id — if missing, use client path for all.
  if (ids.length === 1) {
    const { data, error } = await (supabase as any).rpc("net_sold_qty_for_variant", {
      p_variant_id: ids[0],
    });
    if (!error && data != null) {
      result.set(ids[0], Math.max(0, Number(data) || 0));
      return result;
    }
  } else {
    // Batch via parallel RPC when present
    const rpcResults = await Promise.all(
      ids.map((id) =>
        (supabase as any).rpc("net_sold_qty_for_variant", { p_variant_id: id }),
      ),
    );
    if (rpcResults.every((r: { error: unknown }) => !r.error)) {
      ids.forEach((id, i) => {
        result.set(id, Math.max(0, Number(rpcResults[i].data) || 0));
      });
      return result;
    }
  }

  return aggregateNetSoldClient(ids);
}

async function aggregateNetSoldClient(ids: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (const id of ids) result.set(id, 0);

  // Every row, in batches (a popular size passes 1,000 sale lines; the rest were dropped and
  // the net sold qty came out too low).
  const soldRows = await fetchInIdBatches<{ id: string; variant_id: string; quantity: number; sale_id: string }>(ids, (b) =>
    supabase.from("sale_items").select("id, variant_id, quantity, sale_id").in("variant_id", b).is("deleted_at", null).order("id"),
  );

  const saleIds = [...new Set((soldRows ?? []).map((r) => r.sale_id).filter(Boolean))];
  const liveSaleIds = new Set<string>();
  if (saleIds.length > 0) {
    const sales = await fetchInIdBatches<{ id: string }>(saleIds, (b) =>
      supabase.from("sales").select("id").in("id", b).is("deleted_at", null).order("id"),
    );
    for (const s of sales) liveSaleIds.add(s.id);
  }

  for (const row of soldRows ?? []) {
    if (!row.variant_id || !liveSaleIds.has(row.sale_id)) continue;
    result.set(row.variant_id, (result.get(row.variant_id) || 0) + (Number(row.quantity) || 0));
  }

  const returnRows = await fetchInIdBatches<{ id: string; variant_id: string; quantity: number; return_id: string }>(ids, (b) =>
    supabase.from("sale_return_items").select("id, variant_id, quantity, return_id").in("variant_id", b).is("deleted_at", null).order("id"),
  );

  const returnIds = [...new Set((returnRows ?? []).map((r) => r.return_id).filter(Boolean))];
  const liveReturnIds = new Set<string>();
  if (returnIds.length > 0) {
    const returns = await fetchInIdBatches<{ id: string }>(returnIds, (b) =>
      supabase.from("sale_returns").select("id").in("id", b).is("deleted_at", null).order("id"),
    );
    for (const r of returns) liveReturnIds.add(r.id);
  }

  for (const row of returnRows ?? []) {
    if (!row.variant_id || !liveReturnIds.has(row.return_id)) continue;
    result.set(
      row.variant_id,
      Math.max(0, (result.get(row.variant_id) || 0) - (Number(row.quantity) || 0)),
    );
  }

  return result;
}

export async function getNetSoldQtyForVariant(variantId: string): Promise<number> {
  if (!variantId) return 0;
  const map = await getNetSoldQtyByVariantIds([variantId]);
  return map.get(variantId) || 0;
}
