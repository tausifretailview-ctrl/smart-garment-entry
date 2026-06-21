import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  fetchOrgLedgerCustomersReference,
  orgLedgerCustomersQueryKey,
} from "@/hooks/useOrgLedgerReferenceData";

type OrgLedgerCustomerRow = { id: string; opening_balance?: number | null };

/** Read opening_balance from warmed org-ledger customer cache (no network). */
export function readCustomerOpeningBalanceFromOrgLedgerCache(
  queryClient: QueryClient,
  organizationId: string,
  customerId: string,
): number | undefined {
  const cached = queryClient.getQueryData<OrgLedgerCustomerRow[]>(
    orgLedgerCustomersQueryKey(organizationId),
  );
  const row = cached?.find((c) => c.id === customerId);
  if (row == null) return undefined;
  return Number(row.opening_balance || 0);
}

/** opening_balance from org-ledger reference (shared cache), never a per-id customers SELECT. */
export async function resolveCustomerOpeningBalance(
  organizationId: string,
  customerId: string,
  queryClient?: QueryClient,
): Promise<number> {
  if (queryClient) {
    const fromCache = readCustomerOpeningBalanceFromOrgLedgerCache(
      queryClient,
      organizationId,
      customerId,
    );
    if (fromCache !== undefined) return fromCache;
  }
  const customers = await fetchOrgLedgerCustomersReference(organizationId, queryClient);
  return Number(customers.find((c) => c.id === customerId)?.opening_balance || 0);
}

/** Remaining OB = customers.opening_balance − sum(customer-scoped receipt vouchers). */
export async function fetchCustomerOpeningBalanceRemaining(
  client: SupabaseClient,
  organizationId: string,
  customerId: string,
  queryClient?: QueryClient,
): Promise<number> {
  const ob = await resolveCustomerOpeningBalance(organizationId, customerId, queryClient);
  if (ob <= 0) return 0;

  const { data: vouchersData, error } = await client
    .from("voucher_entries")
    .select("total_amount, discount_amount")
    .eq("organization_id", organizationId)
    .eq("voucher_type", "receipt")
    .eq("reference_type", "customer")
    .eq("reference_id", customerId)
    .is("deleted_at", null);

  if (error) throw error;

  const paid = (vouchersData || []).reduce(
    (sum, v) => sum + Number(v.total_amount || 0) + Number(v.discount_amount || 0),
    0,
  );
  return Math.max(0, ob - paid);
}
