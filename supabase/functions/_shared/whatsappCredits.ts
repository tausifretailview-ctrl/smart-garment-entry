/** Ezzy ERP WhatsApp message balance (whatsapp_message_credits). No row = shop not on credits, no limit. */

export interface CreditRow {
  balance: number | null;
  valid_until: string | null;
}

/** India date (yyyy-MM-dd); valid_until is inclusive in India time. */
export function indiaToday(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60_000).toISOString().slice(0, 10);
}

/** Why a shop may not send, or null when it may. */
export function creditBlockReason(row: CreditRow | null | undefined, now = new Date()): string | null {
  if (!row) return null;
  if (row.valid_until && row.valid_until < indiaToday(now)) {
    return "Your Ezzy ERP WhatsApp message validity is over. Please contact Ezzy ERP to recharge your WhatsApp balance.";
  }
  if (Number(row.balance ?? 0) <= 0) {
    return "Your Ezzy ERP WhatsApp message balance is over. Please contact Ezzy ERP to recharge your WhatsApp balance.";
  }
  return null;
}

// deno-lint-ignore no-explicit-any
export async function loadCreditBlockReason(supabase: any, organizationId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("whatsapp_message_credits")
    .select("balance, valid_until")
    .eq("organization_id", organizationId)
    .maybeSingle();
  // Table missing / read error: never stop a shop's bills over our own lookup.
  if (error) {
    console.warn("[whatsapp-credits] lookup failed:", error.message);
    return null;
  }
  return creditBlockReason(data as CreditRow | null);
}
