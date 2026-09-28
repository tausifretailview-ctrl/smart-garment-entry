import type { SupabaseClient } from "@supabase/supabase-js";

export type SaleReturnRefundPayout = {
  /** Sum of payment vouchers that paid this return's credit out to the customer. */
  amount: number;
  /** Latest voucher date (yyyy-MM-dd), or null when none found. */
  date: string | null;
  /** Latest voucher payment_method, or null when none found. */
  mode: string | null;
};

/** True when `description` names `returnNumber` exactly (SR/26-27/32 but not SR/26-27/320). */
export function descriptionNamesReturn(description: string | null | undefined, returnNumber: string): boolean {
  const d = String(description || "").toLowerCase();
  const rn = returnNumber.toLowerCase();
  let at = d.indexOf(rn);
  while (at >= 0) {
    if (!/\d/.test(d.charAt(at + rn.length))) return true;
    at = d.indexOf(rn, at + 1);
  }
  return false;
}

/**
 * Refund paid out for a credit-note sale return ("Mark as Refund" / "Refund CN"),
 * so a reprint can say the credit is gone instead of "use for future purchases".
 */
export async function fetchSaleReturnRefundPayout(
  client: SupabaseClient,
  params: { organizationId: string; customerId: string; returnNumber: string },
): Promise<SaleReturnRefundPayout> {
  const { data, error } = await client
    .from("voucher_entries")
    .select("voucher_date, total_amount, payment_method, description")
    .eq("organization_id", params.organizationId)
    .eq("voucher_type", "payment")
    .eq("reference_id", params.customerId)
    .is("deleted_at", null)
    .ilike("description", `%${params.returnNumber}%`)
    .order("voucher_date", { ascending: true });
  if (error) {
    console.warn("fetchSaleReturnRefundPayout failed", error);
    return { amount: 0, date: null, mode: null };
  }
  const rows = (data || []).filter(
    (v: { description?: string | null }) =>
      String(v.description || "").toLowerCase().includes("refund") &&
      descriptionNamesReturn(v.description, params.returnNumber),
  );
  const last = rows[rows.length - 1] as { voucher_date?: string | null; payment_method?: string | null } | undefined;
  return {
    amount: rows.reduce((s: number, v: { total_amount?: number | null }) => s + Number(v.total_amount || 0), 0),
    date: last?.voucher_date ? String(last.voucher_date).slice(0, 10) : null,
    mode: last?.payment_method ?? null,
  };
}
