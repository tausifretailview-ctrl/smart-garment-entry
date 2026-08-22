import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchOrgLedgerCustomersReference } from "@/hooks/useOrgLedgerReferenceData";
import {
  fetchCustomerFinancialSnapshotMap,
  fetchCustomersWithFinancialActivity,
} from "@/utils/customerFinancialSnapshot";
import { fetchOrganizationReceivableRows } from "@/utils/organizationReceivables";

/** Minimum outstanding (₹) to appear in Customer Payment receipt picker. */
export const MIN_PAYMENT_PICKER_BALANCE = 1;

export type CustomerPaymentPickerRow = {
  id: string;
  customer_name: string;
  phone: string | null;
  outstandingBalance: number;
};

function labelForCustomer(
  c: { customer_name?: string | null; phone?: string | null } | undefined,
  customerId: string,
): string {
  const name = c?.customer_name?.trim();
  if (name) return name;
  const phone = c?.phone?.trim();
  if (phone) return phone;
  return `Customer ${customerId.slice(0, 8)}`;
}

/** Snapshot RPC fallback when reconcile_customer_balances is empty or unavailable. */
async function buildPickerListFromSnapshot(
  organizationId: string,
  allCustomers: Array<{ id: string; customer_name?: string; phone?: string | null }>,
  client: SupabaseClient = supabase,
): Promise<CustomerPaymentPickerRow[]> {
  const financialIds = await fetchCustomersWithFinancialActivity(organizationId, client);
  const customerIds = allCustomers.map((c) => c.id).filter((id) => financialIds.has(id));
  const snapMap = await fetchCustomerFinancialSnapshotMap(organizationId, customerIds, client);

  return allCustomers
    .map((c) => ({
      id: c.id,
      customer_name: labelForCustomer(c, c.id),
      phone: c.phone ?? null,
      outstandingBalance: snapMap.get(c.id)?.outstandingDr ?? 0,
    }))
    .filter((c) => c.outstandingBalance >= MIN_PAYMENT_PICKER_BALANCE)
    .sort((a, b) => a.customer_name.localeCompare(b.customer_name));
}

/**
 * Customers with receivable balance for the Customer Payment (RCP) picker.
 * Prefers `reconcile_customer_balances` RPC; falls back to financial snapshot batch.
 */
export async function fetchCustomersWithBalanceForPaymentPicker(
  organizationId: string,
  client: SupabaseClient = supabase,
  queryClient?: QueryClient,
): Promise<CustomerPaymentPickerRow[]> {
  const allCustomers = await fetchOrgLedgerCustomersReference(organizationId, queryClient);
  const customerById = new Map(allCustomers.map((c) => [c.id, c]));

  try {
    const rows = await fetchOrganizationReceivableRows(organizationId, client);
    const fromRpc = rows
      .filter((r) => r.balance >= MIN_PAYMENT_PICKER_BALANCE)
      .map((r) => {
        const c = customerById.get(r.customerId);
        return {
          id: r.customerId,
          customer_name: labelForCustomer(c, r.customerId),
          phone: c?.phone ?? null,
          outstandingBalance: r.balance,
        };
      })
      .sort((a, b) => a.customer_name.localeCompare(b.customer_name));

    if (fromRpc.length > 0) return fromRpc;
  } catch (err) {
    console.warn("[customerPaymentPicker] reconcile_customer_balances failed; using snapshot", err);
  }

  try {
    return await buildPickerListFromSnapshot(organizationId, allCustomers, client);
  } catch (err) {
    console.warn("[customerPaymentPicker] snapshot fallback failed", err);
    return [];
  }
}
