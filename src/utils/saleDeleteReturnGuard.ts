import type { SupabaseClient } from "@supabase/supabase-js";

/** Live (not deleted) sale returns whose credit is adjusted against this bill. */
export async function findLiveReturnsLinkedToSale(
  client: SupabaseClient,
  saleId: string,
): Promise<string[]> {
  try {
    const { data, error } = await client
      .from("sale_returns")
      .select("return_number")
      .eq("linked_sale_id", saleId)
      .is("deleted_at", null);
    if (error || !data) return [];
    return (data as Array<{ return_number: string | null }>)
      .map((r) => r.return_number || "")
      .filter(Boolean);
  } catch {
    // A failed lookup must never block a delete.
    return [];
  }
}

export function saleDeleteBlockedByReturnMessage(
  saleNumber: string | null | undefined,
  returnNumbers: string[],
): string {
  return (
    `${saleNumber || "This bill"} has sale return credit adjusted on it (${returnNumbers.join(", ")}). ` +
    `Delete the sale return first, then delete the invoice.`
  );
}
