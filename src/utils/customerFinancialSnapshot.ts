import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { invalidateOrgLedgerReferenceData } from "@/hooks/useOrgLedgerReferenceData";

export type CustomerFinancialSnapshot = {
  outstandingDr: number;
  advanceAvailable: number;
  cnAvailableTotal: number;
  cnPendingCount: number;
};

export const CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY = "customer-financial-snapshot";

const EMPTY_SNAPSHOT: CustomerFinancialSnapshot = {
  outstandingDr: 0,
  advanceAvailable: 0,
  cnAvailableTotal: 0,
  cnPendingCount: 0,
};

/**
 * Smaller chunks keep each RPC call under the Supabase statement_timeout (8s for
 * authenticated). The per-customer reconcile_customer_balance is heavy on orgs
 * with many vouchers/sales; 10 keeps us safe while still amortising round-trips.
 */
const SNAPSHOT_BATCH_CHUNK = 10;

/**
 * Customers that may have a non-zero financial position (sales, advances, or returns).
 * Used to skip snapshot RPCs for customers with no transaction history.
 */
export async function fetchCustomerIdsWithFinancialRecords(
  organizationId: string,
  client: SupabaseClient = supabase,
): Promise<Set<string>> {
  const ids = new Set<string>();
  if (!organizationId) return ids;

  const [salesRes, advancesRes, returnsRes] = await Promise.all([
    client
      .from("sales")
      .select("customer_id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("customer_id", "is", null),
    client
      .from("customer_advances")
      .select("customer_id")
      .eq("organization_id", organizationId),
    client
      .from("sale_returns")
      .select("customer_id")
      .eq("organization_id", organizationId)
      .is("deleted_at", null)
      .not("customer_id", "is", null),
  ]);

  for (const row of salesRes.data || []) {
    if (row.customer_id) ids.add(row.customer_id);
  }
  for (const row of advancesRes.data || []) {
    if (row.customer_id) ids.add(row.customer_id);
  }
  for (const row of returnsRes.data || []) {
    if (row.customer_id) ids.add(row.customer_id);
  }

  return ids;
}

function normalizeRow(row: {
  outstanding_dr?: number | null;
  advance_available?: number | null;
  cn_available_total?: number | null;
  cn_pending_count?: number | null;
}): CustomerFinancialSnapshot {
  return {
    outstandingDr: Math.round(Number(row.outstanding_dr ?? 0)),
    advanceAvailable: Math.round(Number(row.advance_available ?? 0) * 100) / 100,
    cnAvailableTotal: Math.round(Number(row.cn_available_total ?? 0) * 100) / 100,
    cnPendingCount: Math.max(0, Math.floor(Number(row.cn_pending_count ?? 0))),
  };
}

/**
 * Single source of truth for customer headline numbers (live SQL RPC).
 */
export async function fetchCustomerFinancialSnapshot(
  client: SupabaseClient,
  organizationId: string,
  customerId: string,
): Promise<CustomerFinancialSnapshot> {
  if (!organizationId || !customerId) return { ...EMPTY_SNAPSHOT };

  try {
    const { data, error } = await (client.rpc as any)("get_customer_financial_snapshot", {
      p_customer_id: customerId,
      p_organization_id: organizationId,
    });

    if (error) {
      console.warn("[customerFinancialSnapshot] single fetch failed", error);
      return { ...EMPTY_SNAPSHOT };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { ...EMPTY_SNAPSHOT };
    return normalizeRow(row);
  } catch (err) {
    console.warn("[customerFinancialSnapshot] single fetch threw", err);
    return { ...EMPTY_SNAPSHOT };
  }
}

/**
 * Batch snapshot for customer pickers (POS, master list, mobile).
 */
export async function fetchCustomerFinancialSnapshotMap(
  organizationId: string,
  customerIds: string[],
  client: SupabaseClient = supabase,
): Promise<Map<string, CustomerFinancialSnapshot>> {
  const map = new Map<string, CustomerFinancialSnapshot>();
  const unique = [...new Set(customerIds.filter(Boolean))];
  if (!organizationId || unique.length === 0) return map;

  try {
    for (let i = 0; i < unique.length; i += SNAPSHOT_BATCH_CHUNK) {
      const chunk = unique.slice(i, i + SNAPSHOT_BATCH_CHUNK);
      try {
        const { data, error } = await (client.rpc as any)("get_customer_financial_snapshot_batch", {
          p_organization_id: organizationId,
          p_customer_ids: chunk,
        });
        if (error) throw error;

        for (const row of (data || []) as Array<{
          customer_id: string;
          outstanding_dr?: number | null;
          advance_available?: number | null;
          cn_available_total?: number | null;
          cn_pending_count?: number | null;
        }>) {
          if (!row?.customer_id) continue;
          map.set(row.customer_id, normalizeRow(row));
        }
      } catch (err) {
        console.warn("customer financial snapshot chunk failed (treated as empty):", err);
      }
    }
  } catch (err) {
    console.error("[customerFinancialSnapshot] batch map fetch failed", err);
  }

  for (const id of unique) {
    if (!map.has(id)) map.set(id, { ...EMPTY_SNAPSHOT });
  }

  return map instanceof Map ? map : new Map();
}

export type OrganizationCustomerAccountTotals = {
  customerCount: number;
  customersWithOutstanding: number;
  customersWithAdvance: number;
  customersWithCn: number;
  totalOutstandingDr: number;
  totalAdvanceAvailable: number;
  totalCnAvailable: number;
  totalCnPendingCount: number;
};

/**
 * Sum snapshot metrics across all customers (matches Customer Ledger / Accounts totals).
 */
export async function fetchOrganizationCustomerAccountTotals(
  organizationId: string,
  client: SupabaseClient = supabase,
): Promise<OrganizationCustomerAccountTotals> {
  const empty: OrganizationCustomerAccountTotals = {
    customerCount: 0,
    customersWithOutstanding: 0,
    customersWithAdvance: 0,
    customersWithCn: 0,
    totalOutstandingDr: 0,
    totalAdvanceAvailable: 0,
    totalCnAvailable: 0,
    totalCnPendingCount: 0,
  };
  if (!organizationId) return empty;

  const { data: customers, error } = await client
    .from("customers")
    .select("id")
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
  if (error) throw error;

  const ids = (customers || []).map((c: { id: string }) => c.id).filter(Boolean);
  if (ids.length === 0) return empty;

  const financialIds = await fetchCustomerIdsWithFinancialRecords(organizationId, client);
  const idsToFetch = ids.filter((id) => financialIds.has(id));
  const map = await fetchCustomerFinancialSnapshotMap(organizationId, idsToFetch, client);

  const totals = { ...empty, customerCount: ids.length };
  for (const snap of map.values()) {
    if (snap.outstandingDr > 0) totals.customersWithOutstanding += 1;
    if (snap.advanceAvailable > 0.009) totals.customersWithAdvance += 1;
    if (snap.cnAvailableTotal > 0.009) totals.customersWithCn += 1;
    totals.totalOutstandingDr += snap.outstandingDr;
    totals.totalAdvanceAvailable += snap.advanceAvailable;
    totals.totalCnAvailable += snap.cnAvailableTotal;
    totals.totalCnPendingCount += snap.cnPendingCount;
  }

  totals.totalOutstandingDr = Math.round(totals.totalOutstandingDr);
  totals.totalAdvanceAvailable = Math.round(totals.totalAdvanceAvailable * 100) / 100;
  totals.totalCnAvailable = Math.round(totals.totalCnAvailable * 100) / 100;

  return totals;
}

export function formatSnapshotInr(n: number, fractionDigits = 2): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Math.abs(n));
}

/** Invalidate snapshot queries after any sale, receipt, SR, CN, or advance write. */
export function invalidateCustomerFinancialSnapshot(
  queryClient: QueryClient,
  organizationId?: string | null,
  customerId?: string | null,
) {
  queryClient.invalidateQueries({
    queryKey: [CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY],
  });
  if (organizationId) {
    invalidateOrgLedgerReferenceData(queryClient, organizationId);
    queryClient.invalidateQueries({
      queryKey: [CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY, "org-totals", organizationId],
    });
    queryClient.invalidateQueries({
      queryKey: [CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY, organizationId],
    });
    queryClient.invalidateQueries({
      queryKey: ["customer-balances-search", organizationId],
    });
  }
  if (organizationId && customerId) {
    queryClient.invalidateQueries({
      queryKey: [CUSTOMER_FINANCIAL_SNAPSHOT_QUERY_KEY, organizationId, customerId],
    });
  }
  queryClient.invalidateQueries({ queryKey: ["customer-balance"] });
  queryClient.invalidateQueries({ queryKey: ["customer-advances"] });
  queryClient.invalidateQueries({ queryKey: ["customer-advances-search"] });
  queryClient.invalidateQueries({ queryKey: ["customer-credit-notes-search"] });
  queryClient.invalidateQueries({ queryKey: ["cn-adjust-return-meta"] });
  queryClient.invalidateQueries({ queryKey: ["salesman-outstanding"] });
}
