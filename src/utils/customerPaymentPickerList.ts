import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { fetchOrgLedgerCustomersReference } from "@/hooks/useOrgLedgerReferenceData";
import {
  fetchAllCustomerPartyBalances,
  type CustomerPartyBalanceRpcRow,
} from "@/utils/fetchAllRows";
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

/** Map set-based party RPC rows to payment picker options (pure — testable). */
export function mapPartyRowsToPaymentPicker(
  partyRows: CustomerPartyBalanceRpcRow[],
  customerById: Map<string, { customer_name?: string; phone?: string | null }>,
): CustomerPaymentPickerRow[] {
  return partyRows
    .filter((r) => r.signed_balance >= MIN_PAYMENT_PICKER_BALANCE)
    .map((r) => {
      const c = customerById.get(r.customer_id);
      return {
        id: r.customer_id,
        customer_name: labelForCustomer(
          c ?? { customer_name: r.customer_name, phone: null },
          r.customer_id,
        ),
        phone: c?.phone ?? null,
        outstandingBalance: Math.round(r.signed_balance),
      };
    })
    .sort((a, b) => a.customer_name.localeCompare(b.customer_name));
}

/** Fast path — same set-based RPC as Customer Balances page. */
async function buildPickerListFromPartyBalances(
  organizationId: string,
  client: SupabaseClient = supabase,
  queryClient?: QueryClient,
): Promise<CustomerPaymentPickerRow[]> {
  const [partyRows, allCustomers] = await Promise.all([
    fetchAllCustomerPartyBalances(organizationId),
    fetchOrgLedgerCustomersReference(organizationId, queryClient),
  ]);
  const customerById = new Map(allCustomers.map((c) => [c.id, c]));
  return mapPartyRowsToPaymentPicker(partyRows, customerById);
}

/** Last-resort batch snapshot when party + reconcile both fail. */
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
 * Primary: `get_customer_party_balances` (set-based, same as Customer Balances page).
 * Fallback: reconcile_customer_balances, then scoped snapshot batch.
 */
export async function fetchCustomersWithBalanceForPaymentPicker(
  organizationId: string,
  client: SupabaseClient = supabase,
  queryClient?: QueryClient,
): Promise<CustomerPaymentPickerRow[]> {
  try {
    return await buildPickerListFromPartyBalances(organizationId, client, queryClient);
  } catch (err) {
    console.warn("[customerPaymentPicker] party balances failed; trying reconcile", err);
  }

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
