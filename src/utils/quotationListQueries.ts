import { supabase } from "@/integrations/supabase/client";

export const QUOTATION_LIST_PAGE_SIZE = 50;

/**
 * List columns only. Print, edit, WhatsApp, and convert re-fetch the full row
 * plus quotation_items. Embedding every line on open was the slow path.
 */
const QUOTATION_LIST_COLUMNS = [
  "id",
  "quotation_number",
  "quotation_date",
  "customer_id",
  "customer_name",
  "customer_phone",
  "net_amount",
  "status",
  "created_at",
  "organization_id",
].join(", ");

const QUOTATION_ITEM_EXPAND_COLUMNS = [
  "id",
  "product_name",
  "size",
  "quantity",
  "unit_price",
  "line_total",
].join(", ");

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type QuotationListFilters = {
  statusFilter: string;
  customerFilter: string;
  fromDate?: Date;
  toDate?: Date;
  searchQuery: string;
};

type FilterableQuery = {
  eq: (column: string, value: unknown) => FilterableQuery;
  or: (filters: string) => FilterableQuery;
  gte: (column: string, value: string) => FilterableQuery;
  lte: (column: string, value: string) => FilterableQuery;
  is: (column: string, value: null) => FilterableQuery;
};

function escapeIlikeTerm(raw: string): string {
  return raw.replace(/[%_,]/g, " ").trim();
}

/** Local calendar day, matching the previous in-memory date filter. */
export function quotationLocalDayStartIso(date: Date): string {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  return start.toISOString();
}

export function quotationLocalDayEndIso(date: Date): string {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end.toISOString();
}

export function applyQuotationListFilters<Q extends FilterableQuery>(
  query: Q,
  filters: QuotationListFilters,
): Q {
  let q = query;

  if (filters.statusFilter !== "all") {
    q = q.eq("status", filters.statusFilter) as Q;
  }

  if (filters.customerFilter !== "all") {
    if (UUID_RE.test(filters.customerFilter)) {
      q = q.eq("customer_id", filters.customerFilter) as Q;
    } else {
      q = q.eq("customer_name", filters.customerFilter).is("customer_id", null) as Q;
    }
  }

  if (filters.fromDate) {
    q = q.gte("quotation_date", quotationLocalDayStartIso(filters.fromDate)) as Q;
  }

  if (filters.toDate) {
    q = q.lte("quotation_date", quotationLocalDayEndIso(filters.toDate)) as Q;
  }

  const term = escapeIlikeTerm(filters.searchQuery);
  if (term) {
    const pattern = `%${term}%`;
    q = q.or(
      `quotation_number.ilike.${pattern},customer_name.ilike.${pattern},customer_phone.ilike.${pattern}`,
    ) as Q;
  }

  return q;
}

export async function fetchQuotationListPage(
  organizationId: string,
  filters: QuotationListFilters,
  page: number,
  pageSize: number,
) {
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query: any = supabase
    .from("quotations")
    .select(QUOTATION_LIST_COLUMNS, { count: "exact" })
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  query = applyQuotationListFilters(query, filters);

  const { data, error, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw error;

  return {
    rows: data ?? [],
    totalCount: count ?? 0,
  };
}

/** Distinct customers for the filter dropdown. Does not block the first page. */
export async function fetchQuotationCustomerOptions(organizationId: string) {
  const rows: Array<{ customer_id: string | null; customer_name: string | null }> = [];
  let offset = 0;
  const pageSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("quotations")
      .select("customer_id, customer_name")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .order("customer_name")
      .range(offset, offset + pageSize - 1);

    if (error) throw error;

    const page = data ?? [];
    if (page.length === 0) break;
    rows.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return Array.from(
    new Map(
      rows.map((row) => [
        row.customer_id || row.customer_name,
        { id: row.customer_id, name: row.customer_name },
      ]),
    ).values(),
  ).filter((customer) => customer.name);
}

/** Full quotation + line items — edit, print, WhatsApp, convert. */
export async function fetchQuotationWithItems(quotationId: string, organizationId: string) {
  const { data, error } = await supabase
    .from("quotations")
    .select("*, quotation_items(*)")
    .eq("id", quotationId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/** Line items for an expanded list row. */
export async function fetchQuotationLineItems(quotationId: string) {
  const { data, error } = await supabase
    .from("quotation_items")
    .select(QUOTATION_ITEM_EXPAND_COLUMNS)
    .eq("quotation_id", quotationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return data ?? [];
}
