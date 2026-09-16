import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { decidePosSaveAutoRollback } from "@/utils/posSaleDeleteGuard";

export const EMPTY_HEADER_ROLLBACK_REASON =
  "auto-rollback: sale_items insert failed during save";

export const EMPTY_HEADER_ROLLBACK_TOAST = {
  title: "Bill not saved",
  description:
    "The bill could not be saved because line items did not save. Nothing was kept — please re-enter the sale.",
} as const;

/** Soft-cancel an empty sale header — same fields as useSaveSale auto-rollback elsewhere. */
export async function softCancelEmptySaleHeader(
  client: SupabaseClient<Database>,
  saleId: string,
  userId: string | null | undefined,
): Promise<void> {
  const rollbackAt = new Date().toISOString();
  await client.from("sale_items").delete().eq("sale_id", saleId);
  await client
    .from("sales")
    .update({
      deleted_at: rollbackAt,
      deleted_by: userId ?? null,
      is_cancelled: true,
      cancelled_at: rollbackAt,
      cancelled_by: userId ?? null,
      cancelled_reason: EMPTY_HEADER_ROLLBACK_REASON,
      payment_status: "cancelled",
    })
    .eq("id", saleId);
}

export type EmptyHeaderRollbackEvaluation = {
  decision: ReturnType<typeof decidePosSaveAutoRollback>;
  itemCount: number;
};

/** Load live item count + header status, then apply the shared rollback decision. */
export async function evaluateEmptyHeaderRollback(
  client: SupabaseClient<Database>,
  saleId: string,
): Promise<EmptyHeaderRollbackEvaluation> {
  const [{ count: itemCount }, { data: header }] = await Promise.all([
    client
      .from("sale_items")
      .select("id", { count: "exact", head: true })
      .eq("sale_id", saleId)
      .is("deleted_at", null),
    client
      .from("sales")
      .select("sale_type, payment_status")
      .eq("id", saleId)
      .maybeSingle(),
  ]);

  const decision = decidePosSaveAutoRollback({
    saleType: header?.sale_type,
    paymentStatus: header?.payment_status,
    itemCount: itemCount ?? 0,
  });

  return { decision, itemCount: itemCount ?? 0 };
}
