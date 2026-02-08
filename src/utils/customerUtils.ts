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
  
  // Server-side search for existing customer by normalized phone
  // Search for exact match first (most common case)
  const { data: exactMatch, error: exactError } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", params.organization_id)
    .eq("phone", normalizedPhone)
    .is("deleted_at", null)
    .maybeSingle();
  
  if (exactError) throw exactError;
  
  if (exactMatch) {
    return { customer: exactMatch, isExisting: true };
  }
  
  // Also search for variations (with/without country code) using ilike
  // This handles cases like searching for "9819082836" when "919819082836" exists
  const lastDigits = normalizedPhone.slice(-10); // Get last 10 digits
  const { data: fuzzyMatches, error: fuzzyError } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", params.organization_id)
    .ilike("phone", `%${lastDigits}`)
    .is("deleted_at", null)
    .limit(5);
  
  if (fuzzyError) throw fuzzyError;
  
  // Check if any fuzzy match has the same normalized phone
  const existing = fuzzyMatches?.find(c => 
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
  
  // Server-side search for exact match first
  const { data: exactMatch, error: exactError } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("phone", normalizedPhone)
    .is("deleted_at", null)
    .maybeSingle();
  
  if (exactError) throw exactError;
  if (exactMatch) return exactMatch;
  
  // Fuzzy match for phone variations
  const lastDigits = normalizedPhone.slice(-10);
  const { data: fuzzyMatches, error: fuzzyError } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .ilike("phone", `%${lastDigits}`)
    .is("deleted_at", null)
    .limit(5);
  
  if (fuzzyError) throw fuzzyError;
  
  return fuzzyMatches?.find(c => normalizePhoneNumber(c.phone) === normalizedPhone) || null;
}
