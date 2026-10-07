import type { supabase } from "@/integrations/supabase/client";

type Client = typeof supabase;

type AdvanceRow = {
  id: string;
  amount: number | null;
  used_amount: number | null;
  manual_used_amount?: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Take `amount` out of a customer's unused advance (Balance Adjustment: "wrong entry").
 * Oldest booking first. The deduction has no voucher behind it, so it is also recorded in
 * `manual_used_amount`: recompute_customer_advances_used keeps that part when the next
 * advance voucher changes (migration 20270104130000). Before that migration is applied the
 * column does not exist, so the legacy used_amount-only write is used instead.
 *
 * Returns the part that could not be taken because the customer had less advance available.
 */
export async function deductCustomerAdvanceManually(
  client: Client,
  organizationId: string,
  customerId: string,
  amount: number,
): Promise<number> {
  let remaining = round2(Math.abs(Number(amount) || 0));
  if (remaining <= 0) return 0;

  let withManual = true;
  let rows: AdvanceRow[] = [];
  const full = await client
    .from("customer_advances")
    .select("id, amount, used_amount, manual_used_amount")
    .eq("customer_id", customerId)
    .eq("organization_id", organizationId)
    .in("status", ["active", "partially_used"])
    .order("advance_date", { ascending: true });
  if (full.error) {
    withManual = false;
    const legacy = await client
      .from("customer_advances")
      .select("id, amount, used_amount")
      .eq("customer_id", customerId)
      .eq("organization_id", organizationId)
      .in("status", ["active", "partially_used"])
      .order("advance_date", { ascending: true });
    rows = (legacy.data ?? []) as AdvanceRow[];
  } else {
    rows = (full.data ?? []) as AdvanceRow[];
  }

  for (const adv of rows) {
    if (remaining <= 0) break;
    const amt = Number(adv.amount) || 0;
    const used = Number(adv.used_amount) || 0;
    const deduct = Math.min(amt - used, remaining);
    if (deduct <= 0) continue;

    const newUsed = round2(used + deduct);
    const patch = {
      used_amount: newUsed,
      status: newUsed >= amt ? "fully_used" : "partially_used",
    };
    const manual = round2((Number(adv.manual_used_amount) || 0) + deduct);
    const res = withManual
      ? await client
          .from("customer_advances")
          .update({ ...patch, manual_used_amount: manual })
          .eq("id", adv.id)
      : await client.from("customer_advances").update(patch).eq("id", adv.id);
    if (res.error && withManual) {
      await client.from("customer_advances").update(patch).eq("id", adv.id);
    }
    remaining = round2(remaining - deduct);
  }
  return remaining;
}
