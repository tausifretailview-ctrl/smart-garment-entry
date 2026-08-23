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

export type SupplierAliasMatch = SupplierPickerRow & {
  /** The name stored on the purchase bill (snapshot) that matched the search term. */
  billedAs: string;
};

/**
 * Suppliers found by the name printed on their purchase bills (snapshot), not the master name.
 * Handles spelling drift, e.g. bills saved as "SARSWATI SAREE DEPOT LTD." while the
 * master is "SARASWATI SAREE DEPOT LTD.".
 */
export async function searchSuppliersByBillName(
  organizationId: string,
  term: string,
  opts?: { limit?: number },
): Promise<SupplierAliasMatch[]> {
  const trimmed = term.trim();
  if (trimmed.length < 2) return [];
  const limit = Math.max(1, Math.min(opts?.limit ?? 20, 50));

  const { data, error } = await supabase
    .from("purchase_bills")
    .select("supplier_id, supplier_name")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .ilike("supplier_name", `%${trimmed}%`)
    .not("supplier_id", "is", null)
    .limit(500);
  if (error) throw error;

  const billedById = new Map<string, string>();
  for (const row of data || []) {
    const id = row.supplier_id as string | null;
    if (!id || billedById.has(id)) continue;
    billedById.set(id, (row.supplier_name as string) || "");
    if (billedById.size >= limit) break;
  }
  if (billedById.size === 0) return [];

  const masters = await fetchSuppliersByIds(organizationId, [...billedById.keys()]);
  return masters.map((m) => ({ ...m, billedAs: billedById.get(m.id) || "" }));
}

export type SupplierUnpaidTotal = SupplierPickerRow & { unpaidAmount: number; unpaidBills: number };

/**
 * Safety net for the payment picker: every supplier that still has bills where
 * net_amount > paid_amount, computed straight from purchase_bills (independent of
 * the balance snapshot).
 */
export async function fetchSuppliersWithUnpaidBills(
  organizationId: string,
): Promise<SupplierUnpaidTotal[]> {
  const PAGE = 1000;
  let offset = 0;
  const agg = new Map<string, { due: number; count: number }>();

  while (true) {
    const { data, error } = await supabase
      .from("purchase_bills")
      .select("supplier_id, net_amount, paid_amount")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("supplier_id", "is", null)
      .range(offset, offset + PAGE - 1);
    if (error) throw error;
    if (!data?.length) break;

    for (const row of data) {
      const id = row.supplier_id as string | null;
      if (!id) continue;
      const due = (Number(row.net_amount) || 0) - (Number(row.paid_amount) || 0);
      if (due <= 0.01) continue;
      const prev = agg.get(id) || { due: 0, count: 0 };
      agg.set(id, { due: prev.due + due, count: prev.count + 1 });
    }

    if (data.length < PAGE) break;
    offset += PAGE;
  }

  if (agg.size === 0) return [];
  const masters = await fetchSuppliersByIds(organizationId, [...agg.keys()]);
  return masters
    .map((m) => ({
      ...m,
      unpaidAmount: agg.get(m.id)?.due ?? 0,
      unpaidBills: agg.get(m.id)?.count ?? 0,
    }))
    .sort((a, b) => a.supplier_name.localeCompare(b.supplier_name));
}
