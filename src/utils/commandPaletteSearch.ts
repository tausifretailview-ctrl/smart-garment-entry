import { supabase } from "@/integrations/supabase/client";
import {
  fetchCustomerFinancialSnapshotMap,
  type CustomerFinancialSnapshot,
} from "@/utils/customerFinancialSnapshot";
import { searchSaleOrderVariants, type SaleOrderVariantSearchResult } from "@/utils/saleOrderProductSearch";

const CUSTOMER_SEARCH_COLUMNS =
  "id, customer_name, phone, email, organization_id";

const GROUP_LIMIT = 5;
const INVOICE_LOOKBACK_DAYS = 365;
const SNAPSHOT_CACHE_TTL_MS = 60_000;

const EMPTY_SNAPSHOT: CustomerFinancialSnapshot = {
  outstandingDr: 0,
  advanceAvailable: 0,
  cnAvailableTotal: 0,
  cnPendingCount: 0,
};

const commandPaletteSnapshotCache = new Map<
  string,
  { at: number; snap: CustomerFinancialSnapshot }
>();

async function fetchVisibleCustomerSnapshots(
  organizationId: string,
  customerIds: string[],
): Promise<Map<string, CustomerFinancialSnapshot>> {
  const visibleIds = customerIds.slice(0, GROUP_LIMIT);
  const result = new Map<string, CustomerFinancialSnapshot>();
  if (!organizationId || visibleIds.length === 0) return result;

  const now = Date.now();
  const missing: string[] = [];

  for (const id of visibleIds) {
    const cacheKey = `${organizationId}:${id}`;
    const cached = commandPaletteSnapshotCache.get(cacheKey);
    if (cached && now - cached.at < SNAPSHOT_CACHE_TTL_MS) {
      result.set(id, cached.snap);
    } else {
      missing.push(id);
    }
  }

  if (missing.length > 0) {
    const fetched = await fetchCustomerFinancialSnapshotMap(organizationId, missing);
    for (const id of missing) {
      const snap = fetched.get(id) ?? EMPTY_SNAPSHOT;
      commandPaletteSnapshotCache.set(`${organizationId}:${id}`, { at: now, snap });
      result.set(id, snap);
    }
  }

  return result;
}

export type CommandPaletteCustomerResult = {
  id: string;
  customer_name: string;
  phone: string | null;
  outstandingDr: number;
};

export type CommandPaletteProductResult = SaleOrderVariantSearchResult;

export type CommandPaletteInvoiceResult = {
  id: string;
  sale_number: string;
  customer_name: string | null;
  net_amount: number;
  payment_status: string | null;
  sale_type: string | null;
};

export type CommandPaletteSearchResults = {
  customers: CommandPaletteCustomerResult[];
  products: CommandPaletteProductResult[];
  invoices: CommandPaletteInvoiceResult[];
};

function sanitizeForPostgREST(term: string): string {
  return term.replace(/[\\,()]/g, "\\$&");
}

function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "");
}

function invoiceDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - INVOICE_LOOKBACK_DAYS);
  return d.toISOString().slice(0, 10);
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

export async function searchCommandPaletteCustomers(
  organizationId: string,
  rawQuery: string,
  signal?: AbortSignal,
): Promise<CommandPaletteCustomerResult[]> {
  const term = rawQuery.trim();
  if (!term || term.length < 2) return [];

  throwIfAborted(signal);

  const normalizedPhone = normalizePhone(term);
  const safeTerm = sanitizeForPostgREST(term);

  let query = supabase
    .from("customers")
    .select(CUSTOMER_SEARCH_COLUMNS)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);

  const filters = [
    `customer_name.ilike.%${safeTerm}%`,
    `phone.ilike.%${safeTerm}%`,
  ];
  if (normalizedPhone && normalizedPhone !== term) {
    filters.push(`phone.ilike.%${normalizedPhone}%`);
  }
  query = query.or(filters.join(","));

  const { data, error } = await query.order("customer_name").limit(GROUP_LIMIT);
  throwIfAborted(signal);

  if (error) {
    const { data: fallback } = await supabase
      .from("customers")
      .select(CUSTOMER_SEARCH_COLUMNS)
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .ilike("customer_name", `%${safeTerm}%`)
      .order("customer_name")
      .limit(GROUP_LIMIT);
    throwIfAborted(signal);
    if (!fallback?.length) return [];
    const ids = fallback.map((c) => c.id);
    const snapshotMap = await fetchVisibleCustomerSnapshots(organizationId, ids);
    throwIfAborted(signal);
    return fallback.map((c) => ({
      id: c.id,
      customer_name: c.customer_name,
      phone: c.phone,
      outstandingDr: snapshotMap.get(c.id)?.outstandingDr ?? 0,
    }));
  }

  const rows = data || [];
  if (!rows.length) return [];

  const ids = rows.map((c) => c.id);
  const snapshotMap = await fetchVisibleCustomerSnapshots(organizationId, ids);
  throwIfAborted(signal);

  return rows.map((c) => ({
    id: c.id,
    customer_name: c.customer_name,
    phone: c.phone,
    outstandingDr: snapshotMap.get(c.id)?.outstandingDr ?? 0,
  }));
}

export async function searchCommandPaletteProducts(
  organizationId: string,
  rawQuery: string,
  signal?: AbortSignal,
): Promise<CommandPaletteProductResult[]> {
  const term = rawQuery.trim();
  if (!term || term.length < 2) return [];
  throwIfAborted(signal);
  const results = await searchSaleOrderVariants(organizationId, term);
  throwIfAborted(signal);
  return results.slice(0, GROUP_LIMIT);
}

export async function searchCommandPaletteInvoices(
  organizationId: string,
  rawQuery: string,
  signal?: AbortSignal,
): Promise<CommandPaletteInvoiceResult[]> {
  const term = rawQuery.trim();
  if (!term || term.length < 2) return [];
  throwIfAborted(signal);

  const safeTerm = sanitizeForPostgREST(term);
  const saleIds = new Set<string>();
  const merged: CommandPaletteInvoiceResult[] = [];

  const { data: directSales, error: directErr } = await supabase
    .from("sales")
    .select("id, sale_number, customer_name, net_amount, payment_status, sale_type")
    .eq("organization_id", organizationId)
    .is("deleted_at", null)
    .or(`sale_number.ilike.%${safeTerm}%,customer_name.ilike.%${safeTerm}%`)
    .order("created_at", { ascending: false })
    .limit(GROUP_LIMIT);

  throwIfAborted(signal);

  if (!directErr && directSales) {
    for (const row of directSales) {
      if (saleIds.has(row.id)) continue;
      saleIds.add(row.id);
      merged.push({
        id: row.id,
        sale_number: row.sale_number,
        customer_name: row.customer_name,
        net_amount: Number(row.net_amount ?? 0),
        payment_status: row.payment_status,
        sale_type: row.sale_type,
      });
    }
  }

  if (merged.length < GROUP_LIMIT) {
    const { data: rpcIds, error: rpcErr } = await supabase.rpc("search_invoice_sale_ids", {
      p_org_id: organizationId,
      p_search: term,
      p_date_from: invoiceDateFrom(),
      p_date_to: new Date().toISOString().slice(0, 10),
      p_limit: GROUP_LIMIT,
    });
    throwIfAborted(signal);

    if (!rpcErr && rpcIds?.length) {
      const newIds = (rpcIds as { sale_id: string }[])
        .map((r) => r.sale_id)
        .filter((id): id is string => Boolean(id) && !saleIds.has(id));

      if (newIds.length > 0) {
        const { data: rpcSales } = await supabase
          .from("sales")
          .select("id, sale_number, customer_name, net_amount, payment_status, sale_type")
          .eq("organization_id", organizationId)
          .is("deleted_at", null)
          .in("id", newIds.slice(0, GROUP_LIMIT));

        throwIfAborted(signal);

        for (const row of rpcSales || []) {
          if (saleIds.has(row.id) || merged.length >= GROUP_LIMIT) continue;
          saleIds.add(row.id);
          merged.push({
            id: row.id,
            sale_number: row.sale_number,
            customer_name: row.customer_name,
            net_amount: Number(row.net_amount ?? 0),
            payment_status: row.payment_status,
            sale_type: row.sale_type,
          });
        }
      }
    }
  }

  return merged.slice(0, GROUP_LIMIT);
}

export async function searchCommandPaletteAll(
  organizationId: string,
  rawQuery: string,
  signal?: AbortSignal,
): Promise<CommandPaletteSearchResults> {
  const term = rawQuery.trim();
  if (!term || term.length < 2) {
    return { customers: [], products: [], invoices: [] };
  }

  const [customers, products, invoices] = await Promise.all([
    searchCommandPaletteCustomers(organizationId, term, signal),
    searchCommandPaletteProducts(organizationId, term, signal),
    searchCommandPaletteInvoices(organizationId, term, signal),
  ]);

  return { customers, products, invoices };
}

/** Dispatched on billing screens so POS/Sale Invoice can opt in later without palette changes. */
export const COMMAND_PALETTE_PRODUCT_EVENT = "ezzy:command-palette-add-product";

export type CommandPaletteProductEventDetail = {
  variantId: string;
  productId: string;
  barcode: string;
  productName: string;
};

export function isCommandPaletteBillingPath(pathname: string): boolean {
  return /\/(pos-sales|sales-invoice)(\/|$)/.test(pathname);
}
