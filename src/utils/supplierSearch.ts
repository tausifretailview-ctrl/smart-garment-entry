import { supabase } from "@/integrations/supabase/client";

/** Columns for payment picker / name resolution — not a full master dump. */
export type SupplierPickerRow = {
  id: string;
  supplier_name: string;
  phone: string | null;
  email: string | null;
};

const PICKER_COLUMNS = "id, supplier_name, phone, email";

const DEFAULT_SEARCH_LIMIT = 80;

function sanitizeForPostgREST(term: string): string {
  return term.replace(/[\\,()]/g, "\\$&");
}

/**
 * Server-side supplier search for payment/pickers.
 * Empty term returns the first page (alphabetical) — never a full OFFSET walk.
 */
export async function searchSuppliers(
  organizationId: string,
  term: string,
  opts?: { limit?: number },
): Promise<SupplierPickerRow[]> {
  const limit = Math.max(1, Math.min(opts?.limit ?? DEFAULT_SEARCH_LIMIT, 200));
  const trimmed = term.trim();

  let query = supabase
    .from("suppliers")
    .select(PICKER_COLUMNS)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  if (trimmed) {
    const safe = sanitizeForPostgREST(trimmed);
    query = query.or(
      `supplier_name.ilike.%${safe}%,phone.ilike.%${safe}%,email.ilike.%${safe}%`,
    );
  }

  const { data, error } = await query.order("supplier_name").order("id").limit(limit);

  if (error) {
    if (trimmed) {
      const { data: fallback, error: fallbackError } = await supabase
        .from("suppliers")
        .select(PICKER_COLUMNS)
        .eq("organization_id", organizationId)
        .is("deleted_at", null)
        .ilike("supplier_name", `%${trimmed}%`)
        .order("supplier_name")
        .order("id")
        .limit(limit);
      if (fallbackError) throw fallbackError;
      return (fallback || []) as SupplierPickerRow[];
    }
    throw error;
  }

  return (data || []) as SupplierPickerRow[];
}

/**
 * Resolve supplier names for known ids (voucher history / selected payee).
 * Chunked `.in()` — not a full-table walk.
 */
export async function fetchSuppliersByIds(
  organizationId: string,
  ids: string[],
): Promise<SupplierPickerRow[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return [];

  const out: SupplierPickerRow[] = [];
  const CHUNK = 200;
  for (let i = 0; i < unique.length; i += CHUNK) {
    const slice = unique.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from("suppliers")
      .select(PICKER_COLUMNS)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .in("id", slice);
    if (error) throw error;
    out.push(...((data || []) as SupplierPickerRow[]));
  }
  return out;
}
