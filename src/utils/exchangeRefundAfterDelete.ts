import type { SupabaseClient } from "@supabase/supabase-js";

export type LeftoverExchangeRefund = { voucher_number: string; total_amount: number };

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
): Promise<LeftoverExchangeRefund[]> {
  const no = (saleNumber || "").trim();
  if (!no) return [];
  try {
    const { data, error } = await client
      .from("voucher_entries")
      .select("voucher_number, total_amount")
      .eq("organization_id", organizationId)
      .eq("voucher_type", "payment")
      .eq("reference_type", "customer")
      .eq("description", `Refund paid for POS exchange ${no}`)
      .is("deleted_at", null);
    if (error || !data) return [];
    return data
      .map((v: { voucher_number: string | null; total_amount: number | null }) => ({
        voucher_number: v.voucher_number || "",
        total_amount: Number(v.total_amount) || 0,
      }))
      .filter((v) => v.total_amount > 0);
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
