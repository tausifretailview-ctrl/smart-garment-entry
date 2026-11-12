import type { SupabaseClient } from "@supabase/supabase-js";
import type { SaleNumberRequest } from "@/utils/saleNumber";

/**
 * Plan Phase 2, step 1: save a bill header and its lines in one database transaction
 * (save_sale_with_items_atomic). On for every shop by default; a shop can turn it off in
 * Settings → POS "One-step bill save" (sale_settings.atomic_bill_save = false).
 *
 * Returns null when the database function is not there yet, so the caller uses the
 * old two-step insert. Any other error is thrown: the transaction rolled back, so no
 * header or lines were saved and the cashier can safely press save again.
 */

/** On unless the shop explicitly turned it off (missing setting = on). */
export function isAtomicBillSaveEnabled(
  saleSettings: { atomic_bill_save?: unknown } | null | undefined,
): boolean {
  return saleSettings?.atomic_bill_save !== false;
}

/** Lines are built before the bill id exists; the database sets the real sale_id. */
export const ATOMIC_SALE_ID_PLACEHOLDER = "00000000-0000-0000-0000-000000000000";

export type AtomicSaleSaveResult = {
  sale: Record<string, unknown> & { id: string };
  itemsInserted: number;
  droppedSaleKeys: string[];
  droppedItemKeys: string[];
};

type RpcError = { code?: string; message?: string; hint?: string } | null;

export function isMissingAtomicSaleSaveRpc(err: RpcError): boolean {
  return (
    err?.code === "PGRST202" ||
    err?.code === "42883" ||
    /save_sale_with_items_(atomic|numbered)/i.test(String(err?.message || err?.hint || "")) && /not find|does not exist/i.test(String(err?.message || ""))
  );
}

export function parseAtomicSaleSaveResult(data: unknown, expectedLines: number): AtomicSaleSaveResult {
  const r = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const sale = r.sale as AtomicSaleSaveResult["sale"] | undefined;
  if (!sale || typeof sale !== "object" || typeof sale.id !== "string") {
    throw new Error("Bill save returned no bill. Nothing was saved; please try again.");
  }
  const itemsInserted = Number(r.items_inserted) || 0;
  if (itemsInserted !== expectedLines) {
    // The transaction would have failed rather than save part of a bill; this guards the reply.
    throw new Error(`Bill save stored ${itemsInserted} of ${expectedLines} lines. Check the bill before saving again.`);
  }
  const keys = (v: unknown) => (Array.isArray(v) ? v.filter((k): k is string => typeof k === "string") : []);
  return {
    sale,
    itemsInserted,
    droppedSaleKeys: keys(r.dropped_sale_keys),
    droppedItemKeys: keys(r.dropped_item_keys),
  };
}

export async function saveSaleWithItemsAtomic(
  client: SupabaseClient,
  organizationId: string,
  sale: Record<string, unknown>,
  items: Record<string, unknown>[],
): Promise<AtomicSaleSaveResult | null> {
  const { data, error } = await client.rpc("save_sale_with_items_atomic" as never, {
    p_organization_id: organizationId,
    p_sale: sale,
    p_items: items,
  } as never);
  if (error) {
    if (isMissingAtomicSaleSaveRpc(error as RpcError)) return null;
    throw error;
  }
  return parseAtomicSaleSaveResult(data, items.length);
}

/**
 * Plan Phase 2, step 2: the database takes the next POS/INV number inside the same
 * transaction as the bill (save_sale_with_items_numbered), so two counters can never get
 * the same number and a failed save does not use one up. Returns null when that function
 * is not applied yet: the caller then takes the number first, as before.
 */
export async function saveSaleWithItemsNumbered(
  client: SupabaseClient,
  organizationId: string,
  sale: Record<string, unknown>,
  items: Record<string, unknown>[],
  numbering: SaleNumberRequest,
): Promise<(AtomicSaleSaveResult & { saleNumber: string }) | null> {
  const { data, error } = await client.rpc("save_sale_with_items_numbered" as never, {
    p_organization_id: organizationId,
    p_sale: sale,
    p_items: items,
    p_numbering: numbering,
  } as never);
  if (error) {
    if (isMissingAtomicSaleSaveRpc(error as RpcError)) return null;
    throw error;
  }
  const parsed = parseAtomicSaleSaveResult(data, items.length);
  const saleNumber = String(parsed.sale.sale_number ?? "").trim();
  if (!saleNumber) {
    throw new Error("Bill save returned no bill number. Check the sales list before saving again.");
  }
  return { ...parsed, saleNumber };
}
