import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Plan Phase 2, A3: permanent delete of a document with its lines in one database transaction
 * (hard_delete_document). Before, the lines and the header were deleted in separate requests,
 * and a failed header delete left the document without its lines.
 */
export const ONE_STEP_HARD_DELETE_ENTITIES = [
  "sales",
  "sale_returns",
  "purchase_returns",
  "sale_orders",
  "quotations",
  "voucher_entries",
  "products",
] as const;

export type OneStepHardDeleteEntity = (typeof ONE_STEP_HARD_DELETE_ENTITIES)[number];

export function isOneStepHardDeleteEntity(entity: string): entity is OneStepHardDeleteEntity {
  return (ONE_STEP_HARD_DELETE_ENTITIES as readonly string[]).includes(entity);
}

type RpcError = { code?: string; message?: string } | null;

/** True when hard_delete_document is not in the database yet (SQL pending). */
export function isMissingHardDeleteDocumentRpc(err: RpcError): boolean {
  if (!err) return false;
  if (err.code === "PGRST202" || err.code === "42883") return true;
  const msg = String(err.message || "");
  return /hard_delete_document/i.test(msg) && /schema cache|does not exist/i.test(msg);
}

/**
 * Returns true when deleted, null when the function is missing (the caller deletes in steps as
 * before). Any other error is thrown: the transaction rolled back, nothing was deleted.
 */
export async function hardDeleteDocument(
  client: SupabaseClient,
  entity: OneStepHardDeleteEntity,
  id: string,
): Promise<true | null> {
  const { data, error } = await client.rpc("hard_delete_document" as never, {
    p_entity: entity,
    p_id: id,
  } as never);
  if (error) {
    if (isMissingHardDeleteDocumentRpc(error as RpcError)) return null;
    throw error;
  }
  if (!(data && typeof data === "object" && (data as { success?: boolean }).success === true)) {
    throw new Error("Permanent delete did not complete. Nothing was deleted; please try again.");
  }
  return true;
}
