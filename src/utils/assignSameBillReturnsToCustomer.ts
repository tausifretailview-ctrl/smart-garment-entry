import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Same-bill POS exchange: the return is often saved before the cashier picks the
 * customer, so it lands as "Walk-in Customer". The bill's S/R adjust then has no
 * return of its own for that customer, and a later refund of the exchange-excess
 * credit note shows up as Due (ZIBA POS/26-27/323 + SR/26-27/25, 22 Sep 2026).
 *
 * Before the bill saves, move this bill's still-unlinked exchange returns onto the
 * bill's customer so the normal S/R consume links them to the new sale.
 */
export async function assignSameBillReturnsToCustomer(
  client: SupabaseClient,
  params: {
    organizationId: string;
    customerId: string | null | undefined;
    customerName: string | null | undefined;
    returnIds: string[];
  },
): Promise<void> {
  const ids = [...new Set(params.returnIds.filter(Boolean))];
  if (!ids.length || !params.customerId || !params.organizationId) return;
  const { error } = await client
    .from("sale_returns")
    .update({
      customer_id: params.customerId,
      customer_name: (params.customerName || "").trim() || "Customer",
    } as never)
    .eq("organization_id", params.organizationId)
    .in("id", ids)
    .is("customer_id", null)
    .is("linked_sale_id", null)
    .is("deleted_at", null);
  if (error) console.error("assignSameBillReturnsToCustomer failed:", error);
}
