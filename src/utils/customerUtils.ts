import { supabase } from "@/integrations/supabase/client";
import { normalizePhoneNumber } from "./excelImportUtils";

export interface CreateCustomerParams {
  customer_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  gst_number?: string;
  organization_id: string;
  opening_balance?: number;
  discount_percent?: number;
  transport_details?: string;
}

export interface CreateCustomerResult {
  customer: any;
  isExisting: boolean;
}

export type CustomerDuplicateRow = {
  id: string;
  customer_name: string | null;
  phone: string | null;
};

export const CUSTOMER_NAME_OR_NUMBER_EXISTS_MSG =
  "This name or number is already available. Use a different name or number.";

export function normalizeCustomerNameKey(name?: string | null): string {
  return (name || "").trim().toUpperCase();
}

/**
 * Pick a name/phone duplicate from already-loaded rows (unit-tested).
 * Name match is exact after trim + uppercase. Phone uses normalized last-10 digits.
 */
export function matchDuplicateCustomer(
  rows: CustomerDuplicateRow[],
  input: { nameKey: string; normalizedPhone: string | null },
): CustomerDuplicateRow | null {
  if (input.normalizedPhone) {
    const byPhone = rows.find(
      (c) => normalizePhoneNumber(c.phone) === input.normalizedPhone,
    );
    if (byPhone) return byPhone;
  }
  if (input.nameKey) {
    const byName = rows.find(
      (c) => normalizeCustomerNameKey(c.customer_name) === input.nameKey,
    );
    if (byName) return byName;
  }
  return null;
}

async function loadPhoneDuplicateCandidates(
  organizationId: string,
  normalizedPhone: string,
  excludeId?: string,
): Promise<CustomerDuplicateRow[]> {
  let exactQuery = supabase
    .from("customers")
    .select("id, customer_name, phone")
    .eq("organization_id", organizationId)
    .eq("phone", normalizedPhone)
    .is("deleted_at", null);
  if (excludeId) exactQuery = exactQuery.neq("id", excludeId);

  const { data: exactMatch, error: exactError } = await exactQuery.maybeSingle();
  if (exactError) throw exactError;
  if (exactMatch) return [exactMatch as CustomerDuplicateRow];

  const lastDigits = normalizedPhone.slice(-10);
  let fuzzyQuery = supabase
    .from("customers")
    .select("id, customer_name, phone")
    .eq("organization_id", organizationId)
    .ilike("phone", `%${lastDigits}`)
    .is("deleted_at", null)
    .limit(5);
  if (excludeId) fuzzyQuery = fuzzyQuery.neq("id", excludeId);

  const { data: fuzzyMatches, error: fuzzyError } = await fuzzyQuery;
  if (fuzzyError) throw fuzzyError;
  return (fuzzyMatches || []) as CustomerDuplicateRow[];
}

async function loadNameDuplicateCandidates(
  organizationId: string,
  nameKey: string,
  excludeId?: string,
): Promise<CustomerDuplicateRow[]> {
  let query = supabase
    .from("customers")
    .select("id, customer_name, phone")
    .eq("organization_id", organizationId)
    .eq("customer_name", nameKey)
    .is("deleted_at", null)
    .limit(5);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) throw error;
  return (data || []) as CustomerDuplicateRow[];
}

/** Org-scoped active customer with the same name or normalized phone. */
export async function findExistingCustomerByNameOrPhone(
  organizationId: string,
  params: { customer_name?: string; phone?: string | null },
  options?: { excludeId?: string },
): Promise<CustomerDuplicateRow | null> {
  const nameKey = normalizeCustomerNameKey(params.customer_name);
  const normalizedPhone = params.phone ? normalizePhoneNumber(params.phone) || null : null;
  if (!nameKey && !normalizedPhone) return null;

  const [phoneRows, nameRows] = await Promise.all([
    normalizedPhone
      ? loadPhoneDuplicateCandidates(organizationId, normalizedPhone, options?.excludeId)
      : Promise.resolve([] as CustomerDuplicateRow[]),
    nameKey
      ? loadNameDuplicateCandidates(organizationId, nameKey, options?.excludeId)
      : Promise.resolve([] as CustomerDuplicateRow[]),
  ]);

  return matchDuplicateCustomer([...phoneRows, ...nameRows], { nameKey, normalizedPhone });
}

/**
 * Inserts a new customer. Throws if the same name or phone already exists
 * in the organization — never silently reuses / "merges" the old row.
 */
export async function createOrGetCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult> {
  const normalizedPhone = params.phone ? normalizePhoneNumber(params.phone) : null;
  const nameKey = normalizeCustomerNameKey(params.customer_name);

  if (!nameKey && !normalizedPhone) {
    throw new Error("Either customer name or phone number is required");
  }

  const existing = await findExistingCustomerByNameOrPhone(params.organization_id, {
    customer_name: params.customer_name,
    phone: params.phone,
  });
  if (existing) {
    throw new Error(CUSTOMER_NAME_OR_NUMBER_EXISTS_MSG);
  }

  const customerData: any = {
    customer_name: (params.customer_name?.trim() || normalizedPhone || "WALK-IN").toUpperCase(),
    phone: normalizedPhone || null,
    email: params.email || null,
    address: params.address || null,
    gst_number: params.gst_number || null,
    opening_balance: params.opening_balance || 0,
    discount_percent: params.discount_percent || 0,
    transport_details: params.transport_details || null,
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
  organizationId: string,
): Promise<any | null> {
  const normalizedPhone = normalizePhoneNumber(phone);

  if (!normalizedPhone) return null;

  const { data: exactMatch, error: exactError } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("phone", normalizedPhone)
    .is("deleted_at", null)
    .maybeSingle();

  if (exactError) throw exactError;
  if (exactMatch) return exactMatch;

  const lastDigits = normalizedPhone.slice(-10);
  const { data: fuzzyMatches, error: fuzzyError } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", organizationId)
    .ilike("phone", `%${lastDigits}`)
    .is("deleted_at", null)
    .limit(5);

  if (fuzzyError) throw fuzzyError;

  return fuzzyMatches?.find((c) => normalizePhoneNumber(c.phone) === normalizedPhone) || null;
}
