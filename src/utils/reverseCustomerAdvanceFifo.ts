import { supabase } from "@/integrations/supabase/client";

/** Reverse FIFO advance consumption using LIFO on `used_amount` (rollback of applied advance). */
export async function reverseCustomerAdvanceFifo(
  client: typeof supabase,
  organizationId: string,
  customerId: string,
  amountToReverse: number
) {
  let left = Math.round((Number(amountToReverse) || 0) * 100) / 100;
  if (left <= 0) return;
  const { data: advs, error: readErr } = await client
    .from("customer_advances")
    .select("*")
    .eq("customer_id", customerId)
    .eq("organization_id", organizationId)
    .order("advance_date", { ascending: false });
  // A failed read or write used to be ignored, leaving the advance marked used: the customer
  // silently lost that advance balance.
  if (readErr) throw readErr;
  for (const a of advs || []) {
    if (left <= 0) break;
    const used = Number(a.used_amount || 0);
    if (used <= 0) continue;
    const take = Math.min(left, used);
    const newUsed = Math.round((used - take) * 100) / 100;
    const amt = Number(a.amount || 0);
    const newStatus =
      newUsed <= 0 ? "active" : newUsed >= amt - 0.01 ? "fully_used" : "partially_used";
    const { error: updErr } = await client
      .from("customer_advances")
      .update({ used_amount: newUsed, status: newStatus })
      .eq("id", a.id);
    if (updErr) throw updErr;
    left = Math.round((left - take) * 100) / 100;
  }
}
