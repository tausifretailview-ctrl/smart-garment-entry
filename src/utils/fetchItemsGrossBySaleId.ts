import type { SupabaseClient } from "@supabase/supabase-js";

const SALE_ITEMS_GROSS_CHUNK = 200;

function isMissingItemsGrossRpcError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string; details?: string };
  const msg = `${e.message || ""} ${e.details || ""}`.toLowerCase();
  return (
    e.code === "42883" ||
    e.code === "PGRST202" ||
    msg.includes("get_sale_items_gross_batch") ||
    msg.includes("could not find the function")
  );
}

/** Client fallback when get_sale_items_gross_batch RPC is not deployed yet. */
async function fetchItemsGrossBySaleIdRowScan(
  client: SupabaseClient,
  saleIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const unique = [...new Set(saleIds.filter(Boolean))];
  if (unique.length === 0) return map;

  for (let i = 0; i < unique.length; i += SALE_ITEMS_GROSS_CHUNK) {
    const chunk = unique.slice(i, i + SALE_ITEMS_GROSS_CHUNK);
    const { data, error } = await client
      .from("sale_items")
      .select("sale_id, quantity, mrp, line_total, unit_price")
      .in("sale_id", chunk)
      .is("deleted_at", null);
    if (error) throw error;
    for (const it of data || []) {
      const sid = String((it as { sale_id?: string }).sale_id || "");
      if (!sid) continue;
      const qty = Number((it as { quantity?: number }).quantity) || 0;
      const lineTotal = Number((it as { line_total?: number }).line_total) || 0;
      const unitPrice = Number((it as { unit_price?: number }).unit_price) || 0;
      const mrp = Number((it as { mrp?: number }).mrp) || 0;
      // Prefer line_total (sale face) over MRP — MRP ≫ sale price breaks pre-return CN detection.
      const lineFace = lineTotal > 0 ? lineTotal : unitPrice > 0 ? unitPrice * qty : mrp * qty;
      map.set(sid, (map.get(sid) || 0) + lineFace);
    }
  }
  return map;
}

/**
 * Σ(mrp × qty) per sale — used by Sales Dashboard list reconcile and customer balance.
 * Prefers server aggregate RPC; falls back to row scan when migration is not applied.
 */
export async function fetchItemsGrossBySaleId(
  client: SupabaseClient,
  saleIds: string[],
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  const unique = [...new Set(saleIds.filter(Boolean))];
  if (unique.length === 0) return map;

  for (let i = 0; i < unique.length; i += SALE_ITEMS_GROSS_CHUNK) {
    const chunk = unique.slice(i, i + SALE_ITEMS_GROSS_CHUNK);
    const { data, error } = await (client.rpc as any)("get_sale_items_gross_batch", {
      p_sale_ids: chunk,
    });

    if (error) {
      if (!isMissingItemsGrossRpcError(error)) throw error;
      const fallback = await fetchItemsGrossBySaleIdRowScan(client, unique);
      fallback.forEach((value, key) => map.set(key, value));
      return map;
    }

    for (const row of (data || []) as Array<{ sale_id?: string; items_gross?: number }>) {
      const sid = String(row.sale_id || "");
      if (!sid) continue;
      map.set(sid, Number(row.items_gross || 0));
    }
  }

  return map;
}
