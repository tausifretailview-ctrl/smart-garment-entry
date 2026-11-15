import { supabase } from "@/integrations/supabase/client";

/**
 * Purchase bill reads used by Purchase Entry (Plan Phase 4, S4 + D6).
 *
 * These lived inline in the 9,000-line screen. Each read is scoped to the shop, skips the
 * recycle bin, and throws on failure so the screen decides what to tell the user.
 */

export type LastPurchaseBill = {
  software_bill_no: string | null;
  supplier_invoice_no: string | null;
  supplier_name: string | null;
  bill_date: string | null;
};

/** The shop's most recently entered bill (shown as "Last bill" on a new bill), or null. */
export async function fetchLastPurchaseBill(orgId: string): Promise<LastPurchaseBill | null> {
  const { data, error } = await supabase
    .from("purchase_bills")
    .select("software_bill_no, supplier_invoice_no, supplier_name, bill_date")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return (data as LastPurchaseBill | null) ?? null;
}

/**
 * The next auto supplier-invoice serial from the server, or null when the
 * peek_next_supplier_invoice_number SQL is not deployed (the screen then works it out from
 * fetchAutoSupplierInvoiceNumbers).
 */
export async function peekNextSupplierInvoiceNumber(orgId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc("peek_next_supplier_invoice_number", {
    p_organization_id: orgId,
  });
  if (error) {
    if (error.code === "PGRST202" || (error as { status?: number }).status === 404) return null;
    throw error;
  }
  return data ? String(data) : null;
}

export type AutoSupplierInvoiceRow = {
  supplier_invoice_no: string | null;
  supplier_inv_auto_generated: boolean | null;
  software_bill_no: string | null;
  bill_date: string | null;
};

/** Auto-generated supplier invoice numbers of live bills (newest 1,000) — fallback for the peek. */
export async function fetchAutoSupplierInvoiceNumbers(orgId: string): Promise<AutoSupplierInvoiceRow[]> {
  const { data, error } = await supabase
    .from("purchase_bills")
    .select("supplier_invoice_no, supplier_inv_auto_generated, software_bill_no, bill_date")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .or("is_cancelled.is.null,is_cancelled.eq.false")
    .eq("supplier_inv_auto_generated", true)
    .not("supplier_invoice_no", "is", null)
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []) as AutoSupplierInvoiceRow[];
}

export type PurchaseBillNavRow = { id: string; software_bill_no: string | null };

export const purchaseBillIdsQueryKey = (orgId: string | undefined) => ["all-purchase-bill-ids", orgId] as const;

/** Newest 500 bills (id + number) for Last / Previous / Next. */
export async function fetchPurchaseBillIds(orgId: string): Promise<PurchaseBillNavRow[]> {
  const { data, error } = await supabase
    .from("purchase_bills")
    .select("id, software_bill_no")
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data ?? []) as PurchaseBillNavRow[];
}

/** One live bill of this shop, all columns, for editing. Throws when it is missing. */
export async function fetchPurchaseBillForEdit(orgId: string, billId: string) {
  const { data, error } = await supabase
    .from("purchase_bills")
    .select("*")
    .eq("id", billId)
    .eq("organization_id", orgId)
    .is("deleted_at", null)
    .single();
  if (error) throw error;
  return data;
}
