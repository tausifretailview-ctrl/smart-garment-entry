import { supabase } from "@/integrations/supabase/client";

/**
 * Keep one "Finance Discount" expense voucher per financed POS bill.
 *
 * Saving an edited financed bill used to insert a new voucher every time, so the
 * same discount was counted as an expense once per save. Now an existing voucher
 * is updated (or soft-deleted when the discount is removed) and a new one is
 * written only when the bill has none yet.
 */
export async function syncFinanceDiscountVoucher(params: {
  organizationId: string;
  saleId: string;
  saleNumber: string;
  financerName: string;
  financeDiscount: number;
  voucherDate: string;
  client?: typeof supabase;
}): Promise<void> {
  const client = params.client ?? supabase;
  const amount = Math.round((Number(params.financeDiscount) || 0) * 100) / 100;
  const description = `Finance Discount — ${params.financerName} (${params.saleNumber})`;

  const { data: existing, error: lookupError } = await client
    .from("voucher_entries")
    .select("id")
    .eq("organization_id", params.organizationId)
    .eq("voucher_type", "expense")
    .eq("reference_type", "sale")
    .eq("reference_id", params.saleId)
    .eq("category", "finance_discount")
    .is("deleted_at", null)
    .order("created_at", { ascending: true });
  if (lookupError) throw lookupError;

  const [keep, ...extra] = existing || [];
  const dropIds = extra.map((v) => v.id);
  if (keep && amount <= 0) dropIds.push(keep.id);
  if (dropIds.length > 0) {
    const { error } = await client
      .from("voucher_entries")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", dropIds);
    if (error) throw error;
  }
  if (amount <= 0) return;

  if (keep) {
    const { error } = await client
      .from("voucher_entries")
      .update({ total_amount: amount, description })
      .eq("id", keep.id);
    if (error) throw error;
    return;
  }

  const { data: lastVoucher } = await client
    .from("voucher_entries")
    .select("voucher_number")
    .eq("organization_id", params.organizationId)
    .eq("voucher_type", "expense")
    .order("created_at", { ascending: false })
    .limit(1);
  const lastNum = (lastVoucher as any)?.[0]?.voucher_number?.match(/\d+$/)?.[0] || "0";
  const { error } = await client.from("voucher_entries").insert({
    organization_id: params.organizationId,
    voucher_number: `EXP-${String(parseInt(lastNum) + 1).padStart(5, "0")}`,
    voucher_type: "expense",
    voucher_date: params.voucherDate,
    reference_type: "sale",
    reference_id: params.saleId,
    description,
    total_amount: amount,
    category: "finance_discount",
    payment_method: "bank",
  } as any);
  if (error) throw error;
}
