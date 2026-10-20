import { supabase } from "@/integrations/supabase/client";
import type { SpecialDayCustomer } from "@/utils/customerSpecialDays";

const BATCH = 1000;
const MAX_CUSTOMERS = 20000;

/** Customers that have a birthday or anniversary saved (usually a small share of the list). */
export async function fetchSpecialDayCustomers(organizationId: string): Promise<SpecialDayCustomer[]> {
  const out: SpecialDayCustomer[] = [];
  for (let from = 0; from < MAX_CUSTOMERS; from += BATCH) {
    const { data, error } = await supabase
      .from("customers")
      .select("id, customer_name, phone, birthday, anniversary")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .or("birthday.not.is.null,anniversary.not.is.null")
      .order("id", { ascending: true })
      .range(from, from + BATCH - 1);
    if (error) throw error;
    out.push(...((data ?? []) as SpecialDayCustomer[]));
    if (!data || data.length < BATCH) break;
  }
  return out;
}
