import type { SupabaseClient } from "@supabase/supabase-js";

export type LeftoverExchangeRefund = { voucher_number: string; total_amount: number };

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
 * "Refund paid for POS exchange <sale number>". Deleting the bill releases its
 * credit note adjustment but leaves that cash-out voucher on the books (POS/26-27/451
 * on 30-09-2026 kept PAY/26-27/2130). Report what is left so the user can decide.
 * Read-only; a lookup failure returns nothing rather than disturbing the delete.
 */
export async function findLeftoverExchangeRefunds(
  client: SupabaseClient,
  organizationId: string,
  saleNumber: string | null | undefined,
  saleId?: string | null,
): Promise<LeftoverExchangeRefund[]> {
  const no = (saleNumber || "").trim();
  if (!no && !saleId) return [];
  const base = () =>
    client
      .from("voucher_entries")
      .select("voucher_number, total_amount")
      .eq("organization_id", organizationId)
      .eq("voucher_type", "payment")
      .eq("reference_type", "customer");
  try {
    // By bill id (vouchers written since the link was added) and by description
    // (older vouchers). Merged by voucher number.
    const results = await Promise.all([
      saleId
        ? base().eq("client_request_id", posExchangeVoucherRequestId("refund", saleId)).is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
      no
        ? base().eq("description", `Refund paid for POS exchange ${no}`).is("deleted_at", null)
        : Promise.resolve({ data: [], error: null }),
    ]);
    const byNumber = new Map<string, LeftoverExchangeRefund>();
    for (const { data, error } of results as Array<{ data: unknown; error: unknown }>) {
      if (error || !Array.isArray(data)) continue;
      for (const v of data as Array<{ voucher_number: string | null; total_amount: number | null }>) {
        const row = { voucher_number: v.voucher_number || "", total_amount: Number(v.total_amount) || 0 };
        if (row.total_amount > 0) byNumber.set(row.voucher_number || `#${byNumber.size}`, row);
      }
    }
    return Array.from(byNumber.values());
  } catch {
    return [];
  }
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
