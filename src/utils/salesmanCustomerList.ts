import type { QueryClient } from "@tanstack/react-query";
import {
  fetchOrgLedgerCustomersReference,
  fetchOrgLedgerSalesSummaryReference,
} from "@/hooks/useOrgLedgerReferenceData";
import { fetchCustomerReceiptVouchers } from "@/utils/fetchAllRows";
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

/** Fast path: customers + master balances (one RPC). No org-wide voucher/sales scan. */
export async function fetchSalesmanCustomerListCore(
  organizationId: string,
  queryClient?: QueryClient,
): Promise<SalesmanCustomerRow[]> {
  const [customersData, receivableRows] = await Promise.all([
    fetchOrgLedgerCustomersReference(organizationId, queryClient),
    fetchOrganizationReceivableRows(organizationId),
  ]);

  const receivableById = new Map(receivableRows.map((row) => [row.customerId, row]));

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
