import {
  endOfMonth,
  endOfQuarter,
  endOfYear,
  format,
  startOfMonth,
  startOfQuarter,
  startOfYear,
} from "date-fns";
import type { AccountsPaymentTabId } from "@/hooks/useAccountsVoucherData";

/** Preset periods for Accounts payment history panels. */
export type AccountsHistoryPeriod = "daily" | "monthly" | "quarterly" | "yearly" | "all";

export const ACCOUNTS_HISTORY_PERIOD_OPTIONS: Array<{
  value: AccountsHistoryPeriod;
  label: string;
}> = [
  { value: "daily", label: "Today" },
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "yearly", label: "Yearly" },
  { value: "all", label: "All Time" },
];

export function getAccountsHistoryPeriodBounds(
  period: AccountsHistoryPeriod,
  anchorDate: Date = new Date(),
): { start: string | null; end: string | null } {
  switch (period) {
    case "daily":
      return {
        start: format(anchorDate, "yyyy-MM-dd"),
        end: format(anchorDate, "yyyy-MM-dd"),
      };
    case "monthly":
      return {
        start: format(startOfMonth(anchorDate), "yyyy-MM-dd"),
        end: format(endOfMonth(anchorDate), "yyyy-MM-dd"),
      };
    case "quarterly":
      return {
        start: format(startOfQuarter(anchorDate), "yyyy-MM-dd"),
        end: format(endOfQuarter(anchorDate), "yyyy-MM-dd"),
      };
    case "yearly":
      return {
        start: format(startOfYear(anchorDate), "yyyy-MM-dd"),
        end: format(endOfYear(anchorDate), "yyyy-MM-dd"),
      };
    case "all":
    default:
      return { start: null, end: null };
  }
}

/** Compare voucher_date (DATE or ISO string) to inclusive yyyy-MM-dd bounds. */
export function voucherDateInPeriod(
  voucherDate: string | null | undefined,
  bounds: { start: string | null; end: string | null },
): boolean {
  if (!bounds.start && !bounds.end) return true;
  if (!voucherDate) return false;
  const day = voucherDate.slice(0, 10);
  if (bounds.start && day < bounds.start) return false;
  if (bounds.end && day > bounds.end) return false;
  return true;
}

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

const CUSTOMER_RECEIPT_REFERENCE_TYPES = new Set([
  "customer",
  "customer_payment",
  "sale",
]);

/** True for customer RCP rows; excludes supplier/employee/expense receipts. */
export function isCustomerReceiptVoucher(v: PaymentVoucherRow): boolean {
  if (String(v.voucher_type || "").toLowerCase() !== "receipt") return false;
  const refType = String(v.reference_type || "").toLowerCase();
  if (refType === "supplier" || refType === "employee" || refType === "expense") {
    return false;
  }
  return CUSTOMER_RECEIPT_REFERENCE_TYPES.has(refType);
}

export function filterVouchersForPaymentTab(
  tab: AccountsPaymentTabId,
  vouchers: PaymentVoucherRow[] | undefined
): PaymentVoucherRow[] {
  if (!vouchers?.length) return [];
  const list = [...vouchers];
  switch (tab) {
    case "customer-payment":
      return list.filter(isCustomerReceiptVoucher);
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
  return [...rows].sort((a, b) => {
    const dateA = new Date(a.voucher_date || a.created_at || 0).getTime();
    const dateB = new Date(b.voucher_date || b.created_at || 0).getTime();
    if (dateB !== dateA) return dateB - dateA;
    return (
      new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
    );
  });
}

const SALE_NUMBER_IN_DESCRIPTION = /INV\/[\d-]+\/[\d]+/i;

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
    if (invoice?.customer_id) {
      const fromSale = customers?.find((c) => c.id === invoice.customer_id)?.customer_name;
      if (fromSale) return fromSale;
    }
    const refType = String(voucher.reference_type || "").toLowerCase();
    if (refType === "customer" || refType === "customer_payment") {
      const fromCustomer = customers?.find((c) => c.id === voucher.reference_id)?.customer_name;
      if (fromCustomer) return fromCustomer;
    }
    const desc = voucher.description || "";
    const invMatch = desc.match(SALE_NUMBER_IN_DESCRIPTION);
    if (invMatch && sales?.length) {
      const saleByNumber = sales.find(
        (s) => String(s.sale_number || "").toUpperCase() === invMatch[0].toUpperCase(),
      );
      if (saleByNumber?.customer_name) return saleByNumber.customer_name;
      if (saleByNumber?.customer_id) {
        const name = customers?.find((c) => c.id === saleByNumber.customer_id)?.customer_name;
        if (name) return name;
      }
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
