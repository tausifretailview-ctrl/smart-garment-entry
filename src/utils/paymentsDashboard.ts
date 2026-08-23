import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

export type PaymentsDashboardInvoice = {
  id: string;
  sale_number: string;
  customer_name: string;
  customer_id: string | null;
  customer_phone: string | null;
  customer_email: string | null;
  sale_date: string;
  due_date: string | null;
  net_amount: number;
  payment_status: string;
  payment_date: string | null;
  payment_method: string;
  paid_amount?: number;
  flat_discount_amount?: number | null;
  flat_discount_percent?: number | null;
  discount_amount?: number | null;
  gross_amount?: number | null;
  round_off?: number | null;
  salesman?: string | null;
  notes?: string | null;
  cash_amount?: number | null;
  [key: string]: unknown;
};

export type PaymentsDashboardStats = {
  total: number;
  totalRevenue: number;
  pendingAmount: number;
  completedAmount: number;
  collectionRate: number;
};

export type FetchPaymentsDashboardPageParams = {
  organizationId: string;
  statusFilter: string;
  dateFrom?: Date;
  dateTo?: Date;
  searchQuery: string;
  customerId?: string | null;
  page: number;
  pageSize: number;
};

const SALES_LIST_SELECT =
  "id, sale_number, sale_date, customer_name, customer_id, customer_phone, customer_email, net_amount, paid_amount, cash_amount, payment_method, payment_status, payment_date, due_date, flat_discount_amount, flat_discount_percent, discount_amount, gross_amount, round_off, salesman, notes";

function applyPaymentsDashboardFilters<T extends { eq: Function; is: Function; gte: Function; lte: Function; or: Function }>(
  query: T,
  params: Omit<FetchPaymentsDashboardPageParams, "page" | "pageSize">,
): T {
  let q = query
    .eq("organization_id", params.organizationId)
    .is("deleted_at", null) as T;

  if (params.statusFilter === "pending") {
    q = q.eq("payment_status", "pending");
  } else if (params.statusFilter === "partial") {
    q = q.eq("payment_status", "partial");
  } else if (params.statusFilter === "completed") {
    q = q.eq("payment_status", "completed");
  }

  if (params.dateFrom) {
    q = q.gte("sale_date", format(params.dateFrom, "yyyy-MM-dd"));
  }
  if (params.dateTo) {
    q = q.lte("sale_date", format(params.dateTo, "yyyy-MM-dd"));
  }

  if (params.customerId) {
    q = q.eq("customer_id", params.customerId);
  }

  const search = params.searchQuery.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, "");
    const pattern = `%${escaped}%`;
    q = q.or(
      [
        `sale_number.ilike.${pattern}`,
        `customer_name.ilike.${pattern}`,
        `customer_phone.ilike.${pattern}`,
        `customer_email.ilike.${pattern}`,
      ].join(","),
    );
  }

  return q;
}

export async function fetchPaymentsDashboardPage(
  params: FetchPaymentsDashboardPageParams,
): Promise<{ rows: PaymentsDashboardInvoice[]; totalCount: number }> {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  let query = supabase
    .from("sales")
    .select(SALES_LIST_SELECT, { count: "exact" });

  query = applyPaymentsDashboardFilters(query, params);
  query = query.order("sale_date", { ascending: false }).order("id", { ascending: false });
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  return {
    rows: (data ?? []) as PaymentsDashboardInvoice[],
    totalCount: count ?? 0,
  };
}

/** Aggregate stats for the current filter window (lightweight column select, no pagination). */
export async function fetchPaymentsDashboardStats(
  params: Omit<FetchPaymentsDashboardPageParams, "page" | "pageSize">,
): Promise<PaymentsDashboardStats> {
  let query = supabase.from("sales").select("net_amount, paid_amount, payment_status");

  query = applyPaymentsDashboardFilters(query, params);

  const { data, error } = await query;
  if (error) throw error;

  const rows = data ?? [];
  const totalRevenue = rows.reduce((sum, inv) => sum + Number(inv.net_amount || 0), 0);
  const pendingAmount = rows
    .filter((inv) => inv.payment_status !== "completed")
    .reduce(
      (sum, inv) => sum + Math.max(0, Number(inv.net_amount || 0) - Number(inv.paid_amount || 0)),
      0,
    );
  const completedAmount = rows
    .filter((inv) => inv.payment_status === "completed")
    .reduce((sum, inv) => sum + Number(inv.net_amount || 0), 0);

  return {
    total: rows.length,
    totalRevenue,
    pendingAmount,
    completedAmount,
    collectionRate: totalRevenue > 0 ? (completedAmount / totalRevenue) * 100 : 0,
  };
}
