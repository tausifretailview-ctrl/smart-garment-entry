import { supabase } from "@/integrations/supabase/client";

/**
 * A customer's current details for filling an invoice (Plan Phase 4, D6). Sales Invoice read
 * these in three places (open for edit, step to another invoice, bill from a quotation) with
 * separate copies of the query and no shop filter (Row Level Security alone). One read, scoped
 * to the shop. Customers in the recycle bin are still returned: an old invoice must open.
 */
export interface CustomerInvoiceDetails {
  customer_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  gst_number: string | null;
  transport_details: string | null;
  points_balance: number | null;
}

/** The customer's details, or null when not found or the read fails (callers fall back to the bill's copy). */
export async function fetchCustomerInvoiceDetails(
  orgId: string,
  customerId: string,
): Promise<CustomerInvoiceDetails | null> {
  try {
    const { data, error } = await supabase
      .from("customers")
      .select("gst_number, transport_details, address, phone, email, customer_name, points_balance")
      .eq("id", customerId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (error) return null;
    return (data as CustomerInvoiceDetails | null) ?? null;
  } catch {
    return null;
  }
}
