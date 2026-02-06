import { supabase } from "@/integrations/supabase/client";
import { normalizePhoneNumber } from "./excelImportUtils";

export interface CreateCustomerParams {
  customer_name?: string;
  phone: string;
  email?: string;
  address?: string;
  gst_number?: string;
  organization_id: string;
  opening_balance?: number;
  discount_percent?: number;
}

export interface CreateCustomerResult {
  customer: any;
  isExisting: boolean;
}

/**
 * Creates a new customer or returns existing one if a customer with the same
 * normalized phone number already exists. This prevents duplicates across
 * different phone formats (e.g., 919819082836 vs 9819082836).
 */
export async function createOrGetCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult> {
  const normalizedPhone = normalizePhoneNumber(params.phone);
  
  if (!normalizedPhone) {
    throw new Error("Valid phone number is required");
  }
  
  // Fetch all customers in the organization
  const { data: existingCustomers, error: checkError } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", params.organization_id)
    .is("deleted_at", null);
  
  if (checkError) throw checkError;
  
  // Find duplicate by normalized phone
  const existing = existingCustomers?.find(c => 
    normalizePhoneNumber(c.phone) === normalizedPhone
  );
  
  if (existing) {
    return { customer: existing, isExisting: true };
  }
  
  // Create new customer with NORMALIZED phone
  const customerData = {
    customer_name: params.customer_name?.trim() || normalizedPhone,
    phone: normalizedPhone, // Store normalized
    email: params.email || null,
    address: params.address || null,
    gst_number: params.gst_number || null,
    opening_balance: params.opening_balance || 0,
    discount_percent: params.discount_percent || 0,
    organization_id: params.organization_id,
  };
  
  const { data: newCustomer, error } = await supabase
    .from("customers")
    .insert([customerData])
    .select()
    .single();
    
  if (error) throw error;
  
  return { customer: newCustomer, isExisting: false };
}

/**
 * Checks if a customer with the given phone number already exists (using normalized comparison)
 */
export async function findCustomerByNormalizedPhone(
  phone: string,
  organizationId: string
): Promise<any | null> {
  const normalizedPhone = normalizePhoneNumber(phone);
  
  if (!normalizedPhone) return null;
  
  const { data: customers, error } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  
  if (error) throw error;
  
  return customers?.find(c => normalizePhoneNumber(c.phone) === normalizedPhone) || null;
}
