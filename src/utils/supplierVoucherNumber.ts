import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Voucher number for a supplier credit note / refund receipt.
 *
 * `voucher_entries.voucher_number` is unique across ALL organizations
 * (uq_voucher_entries_number_active). The old per-shop "SCN-00001" / "RCP-00001"
 * counters collided with other shops' numbers, so the insert failed and purchase
 * returns were saved without their credit note. `generate_voucher_number` allocates
 * from the global series under a lock (credit_note → VCH/yy-yy/n, receipt → RCP/yy-yy/n).
 */
export async function allocateSupplierVoucherNumber(
  client: SupabaseClient,
  type: "credit_note" | "receipt",
  voucherDate: string,
): Promise<string> {
  const { data, error } = await (client as any).rpc("generate_voucher_number", {
    p_type: type,
    p_date: voucherDate,
  });
  if (error) throw error;
  if (!data) throw new Error("Could not allocate a voucher number");
  return String(data);
}
