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

/** Genuine duplicate — phone already taken (includes same name + same phone). */
export const CUSTOMER_NAME_OR_NUMBER_EXISTS_MSG =
  "This name or number is already available. Use a different name or number.";

export type CustomerDuplicateCheckResult =
  | { kind: "clear" }
  | { kind: "duplicate"; row: CustomerDuplicateRow }
  | { kind: "name_needs_phone"; row: CustomerDuplicateRow; nameDisplay: string };

export function normalizeCustomerNameKey(name?: string | null): string {
  return (name || "").trim().toUpperCase();
}

export function customerNameNeedsPhoneMessage(name: string): string {
  const display = (name || "").trim() || name;
  return `A customer named '${display}' already exists. Enter a mobile number to add this one as a separate customer.`;
}

/**
 * Pick a duplicate outcome from already-loaded rows (unit-tested).
 * Phone match always blocks. Name match alone asks for a phone; name + new phone allows creation.
 */
export function checkDuplicateCustomer(
  rows: CustomerDuplicateRow[],
  input: { nameKey: string; normalizedPhone: string | null; nameDisplay?: string },
): CustomerDuplicateCheckResult {
  if (input.normalizedPhone) {
    const byPhone = rows.find(
      (c) => normalizePhoneNumber(c.phone) === input.normalizedPhone,
    );
    if (byPhone) return { kind: "duplicate", row: byPhone };
    return { kind: "clear" };
  }

  if (input.nameKey) {
    const byName = rows.find(
      (c) => normalizeCustomerNameKey(c.customer_name) === input.nameKey,
    );
    if (byName) {
      return {
        kind: "name_needs_phone",
        row: byName,
        nameDisplay: (input.nameDisplay || "").trim() || input.nameKey,
      };
    }
  }

  return { kind: "clear" };
}

/** @deprecated Prefer checkDuplicateCustomer — returns a row only for genuine phone duplicates. */
export function matchDuplicateCustomer(
  rows: CustomerDuplicateRow[],
  input: { nameKey: string; normalizedPhone: string | null },
): CustomerDuplicateRow | null {
  const result = checkDuplicateCustomer(rows, input);
  return result.kind === "duplicate" ? result.row : null;
}

export function assertNoCustomerDuplicate(check: CustomerDuplicateCheckResult): void {
  if (check.kind === "duplicate") {
    throw new Error(CUSTOMER_NAME_OR_NUMBER_EXISTS_MSG);
  }
  if (check.kind === "name_needs_phone") {
    throw new Error(customerNameNeedsPhoneMessage(check.nameDisplay));
  }
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

/** Org-scoped duplicate check for create/update flows. */
export async function findExistingCustomerByNameOrPhone(
  organizationId: string,
  params: { customer_name?: string; phone?: string | null },
  options?: { excludeId?: string },
): Promise<CustomerDuplicateCheckResult> {
  const nameKey = normalizeCustomerNameKey(params.customer_name);
  const normalizedPhone = params.phone ? normalizePhoneNumber(params.phone) || null : null;
  const nameDisplay = (params.customer_name ?? "").trim();
  if (!nameKey && !normalizedPhone) return { kind: "clear" };

  if (normalizedPhone) {
    const phoneRows = await loadPhoneDuplicateCandidates(
      organizationId,
      normalizedPhone,
      options?.excludeId,
    );
    return checkDuplicateCustomer(phoneRows, { nameKey, normalizedPhone, nameDisplay });
  }

  if (nameKey) {
    const nameRows = await loadNameDuplicateCandidates(organizationId, nameKey, options?.excludeId);
    return checkDuplicateCustomer(nameRows, { nameKey, normalizedPhone: null, nameDisplay });
  }

  return { kind: "clear" };
}

/**
 * Inserts a new customer. Throws if the phone already exists, or if the name
 * exists without a disambiguating new phone — never silently reuses the old row.
 */
export async function createOrGetCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult> {
  const normalizedPhone = params.phone ? normalizePhoneNumber(params.phone) : null;
  const nameKey = normalizeCustomerNameKey(params.customer_name);

  if (!nameKey && !normalizedPhone) {
    throw new Error("Either customer name or phone number is required");
  }

  const duplicateCheck = await findExistingCustomerByNameOrPhone(params.organization_id, {
    customer_name: params.customer_name,
    phone: params.phone,
  });
  assertNoCustomerDuplicate(duplicateCheck);

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
