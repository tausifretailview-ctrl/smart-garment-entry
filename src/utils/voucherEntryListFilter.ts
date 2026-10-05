import { format, isValid, parseISO, startOfDay, endOfDay } from "date-fns";
import { isCustomerReceiptVoucher, resolveVoucherPartyName } from "@/utils/paymentVoucherFilters";

export type VoucherEntryListRow = {
  id: string;
  voucher_number?: string | null;
  voucher_date?: string | null;
  voucher_type?: string | null;
  total_amount?: number | null;
  description?: string | null;
  reference_type?: string | null;
  reference_id?: string | null;
  created_at?: string | null;
};

function parseVoucherDay(value: string | null | undefined): Date | null {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  const d = parseISO(raw);
  return isValid(d) ? d : null;
}

/** Format voucher_date for text search (matches table display). */
export function voucherDateSearchText(voucherDate: string | null | undefined): string {
  const d = parseVoucherDay(voucherDate);
  if (!d) return "";
  return format(d, "dd/MM/yyyy");
}

/** Table date. A bad voucher_date must not throw and blank the tab. */
export function formatVoucherEntryDate(voucherDate: string | null | undefined): string {
  const text = voucherDateSearchText(voucherDate);
  return text || "-";
}

export type VoucherEntryKind = "all" | "payment-receipts";

/**
 * Filter All Voucher Entries by free-text (party / description / voucher no / date)
 * and optional inclusive voucher_date range.
 */
export function filterVoucherEntryRows(args: {
  vouchers: VoucherEntryListRow[] | undefined;
  searchQuery: string;
  dateFrom?: Date;
  dateTo?: Date;
  entryKind?: VoucherEntryKind;
  sales?: Array<{ id: string; customer_id?: string | null; customer_name?: string | null; sale_number?: string | null }>;
  customers?: Array<{ id: string; customer_name?: string | null }>;
}): VoucherEntryListRow[] {
  const rows = args.vouchers || [];
  const q = args.searchQuery.trim().toLowerCase();
  const from = args.dateFrom ? startOfDay(args.dateFrom) : null;
  const to = args.dateTo ? endOfDay(args.dateTo) : null;
  const partyCtx = {
    tab: "customer-payment" as const,
    sales: args.sales,
    customers: args.customers,
  };

  return rows.filter((v) => {
    if (args.entryKind === "payment-receipts" && !isCustomerReceiptVoucher(v)) return false;

    const day = parseVoucherDay(v.voucher_date);
    if (from && (!day || day < from)) return false;
    if (to && (!day || day > to)) return false;

    if (!q) return true;

    const party = resolveVoucherPartyName(v, partyCtx).toLowerCase();
    const haystack = [
      party,
      String(v.voucher_number || ""),
      String(v.description || ""),
      String(v.voucher_type || ""),
      String(v.reference_type || ""),
      voucherDateSearchText(v.voucher_date),
      String(v.voucher_date || "").slice(0, 10),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  });
}
