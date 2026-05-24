import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

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

const SNAPSHOT_BATCH_CHUNK = 50;

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

  const { data, error } = await (client.rpc as any)("get_customer_financial_snapshot", {
    p_customer_id: customerId,
    p_organization_id: organizationId,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { ...EMPTY_SNAPSHOT };
  return normalizeRow(row);
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

  for (let i = 0; i < unique.length; i += SNAPSHOT_BATCH_CHUNK) {
    const chunk = unique.slice(i, i + SNAPSHOT_BATCH_CHUNK);
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
  }

  for (const id of unique) {
    if (!map.has(id)) map.set(id, { ...EMPTY_SNAPSHOT });
  }

  return map;
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
}
