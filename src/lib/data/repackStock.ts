/**
 * Repack (supermarket go-live, Nov 2026): bulk stock into packets in one database step
 * (repack_stock, migration 20270607120000). See the SQL for what moves.
 */
type DbError = { code?: string; message?: string } | null;
export type RepackDb = {
  rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: DbError }>;
};

export type RepackArgs = {
  organizationId: string;
  fromVariantId: string;
  fromQty: number;
  toVariantId: string;
  toQty: number;
  packingCost?: number;
  notes?: string;
};

export type RepackResult = {
  billNumber: string;
  fromStockAfter: number;
  toStockAfter: number;
  toPurPrice: number;
};

export function isMissingRepackRpc(err: DbError): boolean {
  if (!err) return false;
  if (err.code === "PGRST202" || err.code === "42883") return true;
  return /repack_stock/i.test(String(err.message || "")) && /schema cache|does not exist|not find/i.test(String(err.message || ""));
}

/**
 * Cost of one new packet: bulk used × its purchase price + packing cost, over the packets
 * made. (The database then averages it with packets already in stock.)
 */
export function repackUnitCost(fromQty: number, fromPurPrice: number, toQty: number, packingCost = 0): number {
  if (!(toQty > 0)) return 0;
  return Math.round(((Math.max(0, fromQty) * Math.max(0, fromPurPrice) + Math.max(0, packingCost)) / toQty) * 100) / 100;
}

export async function repackStock(db: RepackDb, args: RepackArgs): Promise<RepackResult> {
  const { data, error } = await db.rpc("repack_stock", {
    p_organization_id: args.organizationId,
    p_from_variant_id: args.fromVariantId,
    p_from_qty: args.fromQty,
    p_to_variant_id: args.toVariantId,
    p_to_qty: args.toQty,
    p_packing_cost: args.packingCost ?? 0,
    p_notes: args.notes?.trim() || null,
  });
  if (error) {
    if (isMissingRepackRpc(error)) throw new Error("Run SQL 70 (repack) in the database first.");
    if (/insufficient stock|negative stock/i.test(String(error.message))) {
      throw new Error("Not enough stock of the bulk item.");
    }
    throw new Error(error.message || "Repack failed");
  }
  const r = (data ?? {}) as Record<string, unknown>;
  return {
    billNumber: String(r.bill_number ?? ""),
    fromStockAfter: Number(r.from_stock_after) || 0,
    toStockAfter: Number(r.to_stock_after) || 0,
    toPurPrice: Number(r.to_pur_price) || 0,
  };
}
