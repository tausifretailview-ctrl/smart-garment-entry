import type { QueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchOrgLedgerCustomersReference,
  fetchOrgLedgerSalesSummaryReference,
} from "@/hooks/useOrgLedgerReferenceData";
import { calculateCustomerInvoiceBalances } from "@/utils/customerBalanceUtils";
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

/** Sales + receipt vouchers fallback when reconcile RPC is empty or unavailable. */
async function buildPickerListFromSalesLedger(
  organizationId: string,
  allCustomers: Array<{ id: string; customer_name?: string; phone?: string | null; opening_balance?: number | null }>,
  client: SupabaseClient = supabase,
  queryClient?: QueryClient,
): Promise<CustomerPaymentPickerRow[]> {
  const allSales = await fetchOrgLedgerSalesSummaryReference(organizationId, queryClient);
  const { data: allVouchers } = await client
    .from("voucher_entries")
    .select("reference_id, reference_type, total_amount, discount_amount")
    .eq("organization_id", organizationId)
    .eq("voucher_type", "receipt")
    .is("deleted_at", null);

  const invoiceVoucherPayments = new Map<string, number>();
  const customerOpeningBalancePayments = new Map<string, number>();
  const saleIdSet = new Set(allSales.map((s: { id: string }) => s.id));

  for (const v of allVouchers || []) {
    if (!v.reference_id) continue;
    const amt = Number(v.total_amount || 0) + Number(v.discount_amount || 0);
    if (saleIdSet.has(v.reference_id)) {
      invoiceVoucherPayments.set(
        v.reference_id,
        (invoiceVoucherPayments.get(v.reference_id) || 0) + amt,
      );
    } else if (v.reference_type === "customer") {
      customerOpeningBalancePayments.set(
        v.reference_id,
        (customerOpeningBalancePayments.get(v.reference_id) || 0) + amt,
      );
    }
  }

  const customerBalances = calculateCustomerInvoiceBalances(allSales, invoiceVoucherPayments);

  return allCustomers
    .map((c) => {
      const ob = Number(c.opening_balance || 0);
      const obPaid = customerOpeningBalancePayments.get(c.id) || 0;
      const invoiceBal = customerBalances.get(c.id) || 0;
      const outstandingBalance = Math.round(Math.max(0, ob - obPaid) + invoiceBal);
      return {
        id: c.id,
        customer_name: labelForCustomer(c, c.id),
        phone: c.phone ?? null,
        outstandingBalance,
      };
    })
    .filter((c) => c.outstandingBalance >= MIN_PAYMENT_PICKER_BALANCE)
    .sort((a, b) => a.customer_name.localeCompare(b.customer_name));
}

/**
 * Customers with receivable balance for the Customer Payment (RCP) picker.
 * Prefers `reconcile_customer_balances` RPC; falls back to sales/voucher ledger math.
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
    console.warn("[customerPaymentPicker] reconcile_customer_balances failed; using fallback", err);
  }

  return buildPickerListFromSalesLedger(organizationId, allCustomers, client, queryClient);
}
