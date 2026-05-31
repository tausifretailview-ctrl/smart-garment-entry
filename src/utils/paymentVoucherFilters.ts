import {
  endOfMonth,
  endOfQuarter,
  format,
  startOfMonth,
  startOfQuarter,
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

/** Indian financial year (Apr–Mar) containing anchorDate. */
export function getIndianFinancialYearBounds(anchorDate: Date = new Date()): {
  start: string;
  end: string;
} {
  const month = anchorDate.getMonth();
  const year = anchorDate.getFullYear();
  const fyStartYear = month >= 3 ? year : year - 1;
  return {
    start: format(new Date(fyStartYear, 3, 1), "yyyy-MM-dd"),
    end: format(new Date(fyStartYear + 1, 2, 31), "yyyy-MM-dd"),
  };
}

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
      return getIndianFinancialYearBounds(anchorDate);
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

/** Canonical voucher_entries.reference_type values for customer receipts (SQL .in). */
export const CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES = [
  "sale",
  "SALE",
  "customer",
  "customer_payment",
  "CustomerReceipt",
] as const;

const CUSTOMER_RECEIPT_REFERENCE_TYPES = new Set(
  CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES.map((v) => v.toLowerCase()),
);

/** True for customer RCP rows; excludes supplier/employee/expense receipts. */
export function isCustomerReceiptVoucher(v: PaymentVoucherRow): boolean {
  if (String(v.voucher_type || "").toLowerCase() !== "receipt") return false;
  const refType = String(v.reference_type || "").toLowerCase();
  if (refType === "supplier" || refType === "employee" || refType === "expense") {
    return false;
  }
  if (CUSTOMER_RECEIPT_REFERENCE_TYPES.has(refType)) return true;
  // Legacy rows: missing/other reference_type but RCP series or payment wording
  const desc = (v.description || "").toLowerCase();
  const vno = (v.voucher_number || "").toUpperCase();
  if (vno.startsWith("RCP/") || desc.includes("payment for") || desc.includes("opening balance")) {
    return true;
  }
  return !refType;
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

/** Customer RCP history — newest entry (created_at) first; matches Entry Date & Time column. */
export function sortCustomerReceiptVouchersByEntryNewestFirst(
  rows: PaymentVoucherRow[],
): PaymentVoucherRow[] {
  return [...rows].sort((a, b) => {
    const entryA = new Date(a.created_at || a.voucher_date || 0).getTime();
    const entryB = new Date(b.created_at || b.voucher_date || 0).getTime();
    if (entryB !== entryA) return entryB - entryA;
    return String(b.voucher_number || "").localeCompare(String(a.voucher_number || ""));
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
