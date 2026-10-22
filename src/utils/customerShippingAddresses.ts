import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

/**
 * Extra ship-to addresses (branches) saved on a customer in Customer Master.
 * Stored in customers.shipping_addresses (jsonb array). The bill keeps a text copy in
 * sales.shipping_address; a blank copy means "use the customer's main address".
 */
export interface CustomerShippingAddress {
  /** Branch / area name, e.g. "Andheri branch". Optional. */
  label: string;
  address: string;
}

export function parseCustomerShippingAddresses(raw: unknown): CustomerShippingAddress[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomerShippingAddress[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const label = String((row as { label?: unknown }).label ?? "").trim();
    const address = String((row as { address?: unknown }).address ?? "").trim();
    if (label || address) out.push({ label, address });
  }
  return out;
}

/** Rows the user left completely empty are dropped before saving. */
export function cleanCustomerShippingAddresses(rows: CustomerShippingAddress[]): CustomerShippingAddress[] {
  return parseCustomerShippingAddresses(rows);
}

/** Text printed on the bill in the customer address area. */
export function formatCustomerShippingAddress(entry: CustomerShippingAddress): string {
  const label = entry.label.trim();
  const address = entry.address.trim();
  if (label && address) return `${label}, ${address}`;
  return label || address;
}

/** True when the shop has not run the shipping-addresses SQL yet. */
export function isMissingShippingAddressesColumnError(error: { message?: string; code?: string } | null): boolean {
  if (!error) return false;
  const msg = (error.message || "").toLowerCase();
  return error.code === "42703" || error.code === "PGRST204" || msg.includes("shipping_addresses");
}

export async function fetchCustomerShippingAddresses(
  organizationId: string,
  customerId: string,
): Promise<CustomerShippingAddress[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("shipping_addresses")
    .eq("id", customerId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) {
    if (isMissingShippingAddressesColumnError(error)) return [];
    throw error;
  }
  return parseCustomerShippingAddresses((data as { shipping_addresses?: unknown } | null)?.shipping_addresses);
}

export async function saveCustomerShippingAddresses(
  organizationId: string,
  customerId: string,
  rows: CustomerShippingAddress[],
): Promise<{ error: { message?: string; code?: string } | null }> {
  const { error } = await supabase
    .from("customers")
    .update({ shipping_addresses: cleanCustomerShippingAddresses(rows) as unknown as Json })
    .eq("id", customerId)
    .eq("organization_id", organizationId);
  return { error };
}
