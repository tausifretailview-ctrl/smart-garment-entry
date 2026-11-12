import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Plan Phase 2, returns: save a sale return or a purchase return (number, header and lines) in
 * one database transaction (save_return_with_items_atomic). The number is taken inside, under
 * a per-shop lock, with the same SR/ PR number function the screens called.
 *
 * Returns null when the function is not applied yet, so the screen saves in steps as before.
 * Any other error is thrown: the transaction rolled back, so nothing was saved.
 */

export type ReturnKind = "sale_return" | "purchase_return";

/** Lines are built before the return id exists; the database sets the real return_id. */
export const ATOMIC_RETURN_ID_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

export type AtomicReturnSaveResult = {
  row: Record<string, unknown> & { id: string };
  returnNumber: string;
  itemsInserted: number;
  droppedHeaderKeys: string[];
  droppedItemKeys: string[];
};

type RpcError = { code?: string; message?: string } | null;

export function isMissingAtomicReturnSaveRpc(err: RpcError): boolean {
  if (!err) return false;
  if (err.code === "PGRST202" || err.code === "42883") return true;
  const msg = String(err.message || "");
  return /save_return_with_items_atomic/i.test(msg) && /schema cache|does not exist/i.test(msg);
}

export function parseAtomicReturnSaveResult(data: unknown, expectedLines: number): AtomicReturnSaveResult {
  const r = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const row = r.return as AtomicReturnSaveResult["row"] | undefined;
  if (!row || typeof row !== "object" || typeof row.id !== "string") {
    throw new Error("Return save returned no return. Nothing was saved; please try again.");
  }
  const itemsInserted = Number(r.items_inserted) || 0;
  if (itemsInserted !== expectedLines) {
    throw new Error(`Return save stored ${itemsInserted} of ${expectedLines} lines. Check the return before saving again.`);
  }
  const returnNumber = String(r.return_number ?? row.return_number ?? "").trim();
  if (!returnNumber) throw new Error("Return save returned no return number. Check the list before saving again.");
  const keys = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []);
  return {
    row,
    returnNumber,
    itemsInserted,
    droppedHeaderKeys: keys(r.dropped_header_keys),
    droppedItemKeys: keys(r.dropped_item_keys),
  };
}

export async function saveReturnWithItemsAtomic(
  client: SupabaseClient,
  kind: ReturnKind,
  organizationId: string,
  header: Record<string, unknown>,
  items: Record<string, unknown>[],
): Promise<AtomicReturnSaveResult | null> {
  const { data, error } = await client.rpc("save_return_with_items_atomic" as never, {
    p_kind: kind,
    p_organization_id: organizationId,
    p_header: header,
    p_items: items,
  } as never);
  if (error) {
    if (isMissingAtomicReturnSaveRpc(error as RpcError)) return null;
    throw error;
  }
  return parseAtomicReturnSaveResult(data, items.length);
}
