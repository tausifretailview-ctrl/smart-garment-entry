import type { AccountsPaymentTabId } from "@/hooks/useAccountsVoucherData";

export type PaymentVoucherRow = {
  id: string;
  voucher_number?: string | null;
  voucher_date?: string | null;
  voucher_type?: string | null;
  total_amount?: number | null;
  description?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  payment_method?: string | null;
  discount_amount?: number | null;
  discount_reason?: string | null;
  created_at?: string | null;
  category?: string | null;
  paid_by?: string | null;
  receipt_number?: string | null;
};

export function filterVouchersForPaymentTab(
  tab: AccountsPaymentTabId,
  vouchers: PaymentVoucherRow[] | undefined
): PaymentVoucherRow[] {
  if (!vouchers?.length) return [];
  const list = [...vouchers];
  switch (tab) {
    case "customer-payment":
      return list.filter(
        (v) =>
          (v.voucher_type === "receipt" || v.voucher_type === "RECEIPT") &&
          (v.reference_type === "customer" ||
            v.reference_type === "customer_payment" ||
            v.reference_type === "sale" ||
            v.reference_type === "SALE")
      );
    case "supplier-payment":
      return list.filter(
        (v) =>
          (v.voucher_type === "payment" || v.voucher_type === "PAYMENT") &&
          v.reference_type === "supplier"
      );
    case "expenses":
      return list.filter((v) => v.voucher_type === "expense");
    case "employee-salary":
      return list.filter(
        (v) =>
          (v.voucher_type === "payment" || v.voucher_type === "PAYMENT") &&
          v.reference_type === "employee"
      );
    default:
      return [];
  }
}

export function sortVouchersNewestFirst(rows: PaymentVoucherRow[]): PaymentVoucherRow[] {
  return [...rows].sort(
    (a, b) =>
      new Date(b.created_at || b.voucher_date || 0).getTime() -
      new Date(a.created_at || a.voucher_date || 0).getTime()
  );
}

export function resolveVoucherPartyName(
  voucher: PaymentVoucherRow,
  ctx: {
    tab: AccountsPaymentTabId;
    sales?: any[];
    customers?: any[];
    suppliers?: any[];
    employees?: any[];
  }
): string {
  const { tab, sales, customers, suppliers, employees } = ctx;
  if (tab === "customer-payment") {
    const invoice = sales?.find((s) => s.id === voucher.reference_id);
    if (invoice?.customer_name) return invoice.customer_name;
    if (voucher.reference_type === "customer") {
      return customers?.find((c) => c.id === voucher.reference_id)?.customer_name || "—";
    }
    if (invoice?.customer_id) {
      return customers?.find((c) => c.id === invoice.customer_id)?.customer_name || "—";
    }
    return "—";
  }
  if (tab === "supplier-payment") {
    return suppliers?.find((s) => s.id === voucher.reference_id)?.supplier_name || "—";
  }
  if (tab === "employee-salary") {
    return employees?.find((e) => e.id === voucher.reference_id)?.employee_name || "—";
  }
  if (tab === "expenses") {
    return voucher.category || voucher.description || "—";
  }
  return "—";
}
