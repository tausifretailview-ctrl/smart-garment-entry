import type { SupabaseClient } from "@supabase/supabase-js";

export type LeftoverExchangeRefund = { id?: string; voucher_number: string; total_amount: number };

/**
 * Stable key stored in `voucher_entries.client_request_id` on the POS exchange refund
 * (and round-off) payment voucher. It links the voucher to its bill by id, so lookups do
 * not depend on the description text, and the live partial unique index
 * `uq_voucher_entries_client_request_active` refuses a second active refund voucher for
 * the same bill (the Afreen duplicate class).
 */
export function posExchangeVoucherRequestId(kind: "refund" | "roundoff", saleId: string): string {
  return `pos-exchange-${kind}:${saleId}`;
}

/**
 * POS exchange refunds are saved as a customer payment voucher described
 * "Refund paid for POS exchange <sale number>" (plus an optional round-off voucher).
 * They are linked to the bill by id (client_request_id) and, for older vouchers, by
 * description. Read-only; a lookup failure returns nothing rather than disturbing the caller.
 */
async function findExchangeVouchers(
  client: SupabaseClient,
  organizationId: string,
  saleNumber: string | null | undefined,
  saleId: string | null | undefined,
  state: "live" | "deleted",
): Promise<Array<LeftoverExchangeRefund & { deleted_at?: string | null }>> {
  const no = (saleNumber || "").trim();
  if (!no && !saleId) return [];
  const base = () => {
    const q = client
      .from("voucher_entries")
      .select("id, voucher_number, total_amount, deleted_at")
      .eq("organization_id", organizationId)
      .eq("voucher_type", "payment")
      .eq("reference_type", "customer");
    return q;
  };
  const finish = (q: ReturnType<typeof base>) =>
    state === "live" ? q.is("deleted_at", null) : q.not("deleted_at", "is", null);
  try {
    // By bill id (vouchers written since the link was added) and by description
    // (older vouchers). Merged by voucher id / number.
    const lookups: Array<PromiseLike<{ data: unknown; error: unknown }>> = [];
    if (saleId) {
      for (const kind of ["refund", "roundoff"] as const) {
        lookups.push(finish(base().eq("client_request_id", posExchangeVoucherRequestId(kind, saleId))));
      }
    }
    if (no) {
      lookups.push(finish(base().eq("description", `Refund paid for POS exchange ${no}`)));
      lookups.push(finish(base().eq("description", `Round off adjustment for POS exchange ${no}`)));
    }
    const results = await Promise.all(lookups);
    const byKey = new Map<string, LeftoverExchangeRefund & { deleted_at?: string | null }>();
    for (const { data, error } of results) {
      if (error || !Array.isArray(data)) continue;
      for (const v of data as Array<{
        id?: string | null;
        voucher_number: string | null;
        total_amount: number | null;
        deleted_at?: string | null;
      }>) {
        const row = {
          ...(v.id ? { id: v.id } : {}),
          voucher_number: v.voucher_number || "",
          total_amount: Number(v.total_amount) || 0,
          ...(v.deleted_at ? { deleted_at: v.deleted_at } : {}),
        };
        if (row.total_amount > 0) byKey.set(v.id || row.voucher_number || `#${byKey.size}`, row);
      }
    }
    return Array.from(byKey.values());
  } catch {
    return [];
  }
}

/** Live exchange refund / round-off vouchers of a bill. */
export async function findLeftoverExchangeRefunds(
  client: SupabaseClient,
  organizationId: string,
  saleNumber: string | null | undefined,
  saleId?: string | null,
): Promise<LeftoverExchangeRefund[]> {
  return findExchangeVouchers(client, organizationId, saleNumber, saleId, "live");
}

/**
 * Deleting an exchange bill voids the exchange, so its cash refund voucher goes to the
 * Recycle Bin with it (WAJIUDDEEN: POS/26-27/136 deleted, PAY/26-27/2186 ₹100 left the
 * customer owing ₹100). Uses soft_delete_voucher, same as deleting the voucher by hand.
 */
export async function softDeleteExchangeRefundsForSale(
  client: SupabaseClient,
  organizationId: string,
  saleNumber: string | null | undefined,
  saleId: string,
  userId: string,
): Promise<{ deleted: LeftoverExchangeRefund[]; failed: LeftoverExchangeRefund[] }> {
  const deleted: LeftoverExchangeRefund[] = [];
  const failed: LeftoverExchangeRefund[] = [];
  const live = await findExchangeVouchers(client, organizationId, saleNumber, saleId, "live");
  for (const v of live) {
    if (!v.id) {
      failed.push(v);
      continue;
    }
    try {
      const { error } = await client.rpc("soft_delete_voucher", { p_voucher_id: v.id, p_user_id: userId });
      if (error) throw error;
      deleted.push({ id: v.id, voucher_number: v.voucher_number, total_amount: v.total_amount });
    } catch {
      failed.push(v);
    }
  }
  return { deleted, failed };
}

/** Vouchers deleted within this window of the bill count as deleted with it. */
const DELETED_WITH_BILL_MS = 5 * 60 * 1000;

/**
 * Restoring the bill brings back the exchange refund vouchers that were deleted with it
 * (deleted within a few minutes of the bill). A voucher deleted on its own stays deleted.
 */
export async function restoreExchangeRefundsForSale(
  client: SupabaseClient,
  organizationId: string,
  saleNumber: string | null | undefined,
  saleId: string,
  saleDeletedAt: string | null | undefined,
): Promise<LeftoverExchangeRefund[]> {
  const billDeletedMs = saleDeletedAt ? Date.parse(saleDeletedAt) : NaN;
  if (!Number.isFinite(billDeletedMs)) return [];
  const deletedRows = await findExchangeVouchers(client, organizationId, saleNumber, saleId, "deleted");
  const restored: LeftoverExchangeRefund[] = [];
  for (const v of deletedRows) {
    const ms = v.deleted_at ? Date.parse(v.deleted_at) : NaN;
    if (!v.id || !Number.isFinite(ms) || Math.abs(ms - billDeletedMs) > DELETED_WITH_BILL_MS) continue;
    try {
      const { error } = await client.rpc("restore_voucher", { p_voucher_id: v.id });
      if (error) throw error;
      restored.push({ id: v.id, voucher_number: v.voucher_number, total_amount: v.total_amount });
    } catch {
      // leave it in the Recycle Bin; the user can restore it by hand
    }
  }
  return restored;
}

export function leftoverExchangeRefundMessage(
  saleNumber: string,
  refunds: LeftoverExchangeRefund[],
): string {
  const total = refunds.reduce((s, r) => s + r.total_amount, 0);
  const list = refunds.map((r) => r.voucher_number).filter(Boolean).join(", ");
  return (
    `${saleNumber} had an exchange refund of ₹${Math.round(total).toLocaleString("en-IN")}` +
    `${list ? ` (${list})` : ""} that is still in the books. ` +
    `If that cash was not actually paid out, delete the payment voucher too; ` +
    `otherwise the customer's balance and the cashier report stay ₹${Math.round(total).toLocaleString("en-IN")} off.`
  );
}
