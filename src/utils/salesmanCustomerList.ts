import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  fetchOrgLedgerCustomersReference,
  fetchOrgLedgerSalesSummaryReference,
} from "@/hooks/useOrgLedgerReferenceData";
import { fetchCustomerReceiptVouchers } from "@/utils/fetchAllRows";
import { calculateCustomerInvoiceBalances } from "@/utils/customerBalanceUtils";
import { fetchOrganizationReceivableRows } from "@/utils/organizationReceivables";
import { isCustomerReceiptVoucher } from "@/utils/paymentVoucherFilters";

export type SalesmanCustomerRow = {
  id: string;
  customer_name: string;
  phone: string | null;
  address: string | null;
  opening_balance: number;
  totalSales: number;
  totalPaid: number;
  balance: number;
  lastOrderDate: string | null;
  lastPaymentDate: string | null;
  daysSinceLastPayment: number;
};

export const SALESMAN_CUSTOMER_LIST_QUERY_KEY = "salesman-customer-list";

function daysSincePayment(paymentDate: string | null) {
  if (!paymentDate) return 99999;
  return Math.floor(
    (Date.now() - new Date(paymentDate).getTime()) / (1000 * 60 * 60 * 24),
  );
}

function sortSalesmanCustomers(rows: SalesmanCustomerRow[]) {
  rows.sort((a, b) => {
    if (b.daysSinceLastPayment !== a.daysSinceLastPayment) {
      return b.daysSinceLastPayment - a.daysSinceLastPayment;
    }
    return b.balance - a.balance;
  });
}

function buildActivityMaps(
  sales: Array<{
    id?: string;
    customer_id?: string | null;
    sale_date?: string | null;
    payment_date?: string | null;
    payment_status?: string | null;
  }>,
  receiptVouchers: Array<{
    id?: string | null;
    reference_id?: string | null;
    reference_type?: string | null;
    voucher_date?: string | null;
    created_at?: string | null;
    voucher_type?: string | null;
  }>,
) {
  const lastOrderByCustomer = new Map<string, string>();
  const lastPaymentByCustomer = new Map<string, string>();
  const saleToCustomer = new Map<string, string>();

  for (const sale of sales) {
    const customerId = sale.customer_id;
    if (!customerId) continue;
    if (sale.id) saleToCustomer.set(sale.id, customerId);
    if (sale.sale_date) {
      const prev = lastOrderByCustomer.get(customerId);
      if (!prev || sale.sale_date > prev) lastOrderByCustomer.set(customerId, sale.sale_date);
    }
    if (sale.payment_date && sale.payment_status === "completed") {
      const prev = lastPaymentByCustomer.get(customerId);
      if (!prev || sale.payment_date > prev) {
        lastPaymentByCustomer.set(customerId, sale.payment_date);
      }
    }
  }

  for (const voucher of receiptVouchers) {
    if (!isCustomerReceiptVoucher(voucher as any)) continue;
    const date = voucher.voucher_date || voucher.created_at;
    if (!date || !voucher.reference_id) continue;

    let customerId: string | null = null;
    const refType = String(voucher.reference_type || "").toLowerCase();
    if (refType === "customer" || refType === "customer_payment") {
      customerId = voucher.reference_id;
    } else {
      customerId = saleToCustomer.get(voucher.reference_id) ?? null;
    }
    if (!customerId) continue;

    const prev = lastPaymentByCustomer.get(customerId);
    if (!prev || date > prev) lastPaymentByCustomer.set(customerId, date);
  }

  return { lastOrderByCustomer, lastPaymentByCustomer };
}

type ReceivableLookup = Map<
  string,
  { balance: number; totalInvoices: number; totalCashPayments: number }
>;

/** Sales + receipt fallback when reconcile_customer_balances RPC fails (mobile timeout, etc.). */
async function fetchSalesmanReceivableFallback(
  organizationId: string,
  customersData: Array<{ id: string; opening_balance?: number | null }>,
  queryClient?: QueryClient,
): Promise<ReceivableLookup> {
  const allSales = await fetchOrgLedgerSalesSummaryReference(organizationId, queryClient);
  const { data: allVouchers, error: voucherError } = await supabase
    .from("voucher_entries")
    .select("reference_id, reference_type, total_amount, discount_amount")
    .eq("organization_id", organizationId)
    .eq("voucher_type", "receipt")
    .is("deleted_at", null);
  if (voucherError) throw voucherError;

  const invoiceVoucherPayments = new Map<string, number>();
  const customerOpeningBalancePayments = new Map<string, number>();
  const saleIdSet = new Set((allSales || []).map((s: { id: string }) => s.id));
  const saleById = new Map((allSales || []).map((s: { id: string; customer_id?: string | null }) => [s.id, s]));
  const totalInvoicesByCustomer = new Map<string, number>();
  const totalCashByCustomer = new Map<string, number>();

  for (const sale of allSales || []) {
    const customerId = sale.customer_id;
    if (!customerId) continue;
    totalInvoicesByCustomer.set(
      customerId,
      (totalInvoicesByCustomer.get(customerId) || 0) + Number(sale.net_amount || 0),
    );
  }

  for (const voucher of allVouchers || []) {
    if (!voucher.reference_id) continue;
    const amt = Number(voucher.total_amount || 0) + Number(voucher.discount_amount || 0);
    if (saleIdSet.has(voucher.reference_id)) {
      invoiceVoucherPayments.set(
        voucher.reference_id,
        (invoiceVoucherPayments.get(voucher.reference_id) || 0) + amt,
      );
      const sale = saleById.get(voucher.reference_id);
      const customerId = sale?.customer_id;
      if (customerId) {
        totalCashByCustomer.set(customerId, (totalCashByCustomer.get(customerId) || 0) + amt);
      }
    } else if (voucher.reference_type === "customer") {
      customerOpeningBalancePayments.set(
        voucher.reference_id,
        (customerOpeningBalancePayments.get(voucher.reference_id) || 0) + amt,
      );
      totalCashByCustomer.set(
        voucher.reference_id,
        (totalCashByCustomer.get(voucher.reference_id) || 0) + amt,
      );
    }
  }

  const customerInvoiceBalances = calculateCustomerInvoiceBalances(allSales || [], invoiceVoucherPayments);
  const out: ReceivableLookup = new Map();

  for (const customer of customersData) {
    const openingBalance = Number(customer.opening_balance || 0);
    const openingPaid = customerOpeningBalancePayments.get(customer.id) || 0;
    const invoiceOutstanding = customerInvoiceBalances.get(customer.id) || 0;
    const balance = Math.round(Math.max(0, openingBalance - openingPaid) + invoiceOutstanding);
    out.set(customer.id, {
      balance,
      totalInvoices: Math.round(totalInvoicesByCustomer.get(customer.id) || 0),
      totalCashPayments: Math.round(totalCashByCustomer.get(customer.id) || 0),
    });
  }

  return out;
}

async function resolveSalesmanReceivableLookup(
  organizationId: string,
  customersData: Array<{ id: string; opening_balance?: number | null }>,
  queryClient?: QueryClient,
): Promise<ReceivableLookup> {
  try {
    const receivableRows = await fetchOrganizationReceivableRows(organizationId);
    return new Map(
      receivableRows.map((row) => [
        row.customerId,
        {
          balance: row.balance,
          totalInvoices: row.totalInvoices,
          totalCashPayments: row.totalCashPayments,
        },
      ]),
    );
  } catch (err) {
    console.warn(
      "[salesmanCustomerList] reconcile_customer_balances failed; using sales ledger fallback",
      err,
    );
  }

  try {
    return await fetchSalesmanReceivableFallback(organizationId, customersData, queryClient);
  } catch (err) {
    console.warn("[salesmanCustomerList] receivable fallback failed; using opening balance only", err);
    const out: ReceivableLookup = new Map();
    for (const customer of customersData) {
      out.set(customer.id, {
        balance: Math.round(Number(customer.opening_balance || 0)),
        totalInvoices: 0,
        totalCashPayments: 0,
      });
    }
    return out;
  }
}

/** Fast path: customers + master balances (one RPC). No org-wide voucher/sales scan. */
export async function fetchSalesmanCustomerListCore(
  organizationId: string,
  queryClient?: QueryClient,
): Promise<SalesmanCustomerRow[]> {
  const customersData = await fetchOrgLedgerCustomersReference(organizationId, queryClient);
  const receivableById = await resolveSalesmanReceivableLookup(
    organizationId,
    customersData || [],
    queryClient,
  );

  const rows: SalesmanCustomerRow[] = (customersData || []).map((c: any) => {
    const receivable = receivableById.get(c.id);
    const openingBalance = Number(c.opening_balance || 0);
    return {
      id: c.id,
      customer_name: c.customer_name,
      phone: c.phone ?? null,
      address: c.address ?? null,
      opening_balance: openingBalance,
      totalSales: receivable?.totalInvoices ?? 0,
      totalPaid: receivable?.totalCashPayments ?? 0,
      balance: receivable?.balance ?? 0,
      lastOrderDate: null,
      lastPaymentDate: null,
      daysSinceLastPayment: 99999,
    };
  });

  sortSalesmanCustomers(rows);
  return rows;
}

/** Background enrich: last order / last payment dates for collection-priority sort. */
export async function enrichSalesmanCustomerActivity(
  organizationId: string,
  rows: SalesmanCustomerRow[],
  queryClient?: QueryClient,
): Promise<SalesmanCustomerRow[]> {
  const [sales, receiptVouchers] = await Promise.all([
    fetchOrgLedgerSalesSummaryReference(organizationId, queryClient),
    fetchCustomerReceiptVouchers(organizationId),
  ]);

  const { lastOrderByCustomer, lastPaymentByCustomer } = buildActivityMaps(
    sales || [],
    receiptVouchers || [],
  );

  const enriched = rows.map((row) => {
    const lastOrderDate = lastOrderByCustomer.get(row.id) ?? null;
    const lastPaymentDate = lastPaymentByCustomer.get(row.id) ?? null;
    return {
      ...row,
      lastOrderDate,
      lastPaymentDate,
      daysSinceLastPayment: daysSincePayment(lastPaymentDate),
    };
  });

  sortSalesmanCustomers(enriched);
  return enriched;
}
