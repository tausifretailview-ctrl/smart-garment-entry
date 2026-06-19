import {
  endOfMonth,
  endOfYear,
  format,
  isAfter,
  isBefore,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
} from "date-fns";

export type CustomerAccountPeriodFilter = "weekly" | "monthly" | "yearly" | "all" | "custom";

export type CustomerAccountTabFilters = {
  search: string;
  period: CustomerAccountPeriodFilter;
  dateFrom?: Date;
  dateTo?: Date;
  status: string;
  type: string;
};

export const defaultCustomerAccountTabFilters = (): CustomerAccountTabFilters => ({
  search: "",
  period: "all",
  status: "all",
  type: "all",
});

function getPeriodBounds(filters: CustomerAccountTabFilters) {
  const today = new Date();
  switch (filters.period) {
    case "weekly":
      return { start: startOfDay(subDays(today, 6)), end: today };
    case "monthly":
      return { start: startOfMonth(today), end: endOfMonth(today) };
    case "yearly":
      return { start: startOfYear(today), end: endOfYear(today) };
    case "custom":
      return { start: filters.dateFrom, end: filters.dateTo };
    default:
      return { start: null as Date | null | undefined, end: null as Date | null | undefined };
  }
}

export function matchesPeriod(dateValue: string | Date | null | undefined, filters: CustomerAccountTabFilters) {
  if (!dateValue || filters.period === "all") return true;
  const { start, end } = getPeriodBounds(filters);
  if (!start && !end) return true;
  const d = new Date(dateValue);
  if (start && isBefore(d, startOfDay(start))) return false;
  if (end && isAfter(d, end)) return false;
  return true;
}

function matchesSearch(haystack: string, filters: CustomerAccountTabFilters) {
  const q = filters.search.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}

export function isSaleRecordCancelled(sale: { is_cancelled?: boolean | null; payment_status?: string | null }) {
  return sale.is_cancelled === true || String(sale.payment_status || "").toLowerCase() === "cancelled";
}

export function filterSales<T extends {
  sale_number?: string | null;
  sale_date?: string | null;
  sale_type?: string | null;
  payment_status?: string | null;
  is_cancelled?: boolean | null;
}>(rows: T[] | undefined, filters: CustomerAccountTabFilters) {
  return (rows || []).filter((sale) => {
    const cancelled = isSaleRecordCancelled(sale);
    if (filters.status === "cancelled" && !cancelled) return false;
    if (filters.status !== "all" && filters.status !== "cancelled") {
      if (cancelled) return false;
      if (String(sale.payment_status || "").toLowerCase() !== filters.status) return false;
    }
    if (filters.type !== "all" && String(sale.sale_type || "").toLowerCase() !== filters.type) return false;
    if (!matchesPeriod(sale.sale_date, filters)) return false;
    return matchesSearch(
      [sale.sale_number, sale.sale_type, sale.payment_status].filter(Boolean).join(" "),
      filters,
    );
  });
}

export function filterByDateAndSearch<T extends Record<string, unknown>>(
  rows: T[] | undefined,
  filters: CustomerAccountTabFilters,
  dateKey: keyof T,
  searchKeys: (keyof T)[],
) {
  return (rows || []).filter((row) => {
    if (!matchesPeriod(row[dateKey] as string | Date | null | undefined, filters)) return false;
    const haystack = searchKeys
      .map((k) => String(row[k] ?? ""))
      .filter(Boolean)
      .join(" ");
    return matchesSearch(haystack, filters);
  });
}

export function filterLegacyInvoices<T extends {
  invoice_number?: string | null;
  invoice_date?: string | null;
  payment_status?: string | null;
  source?: string | null;
}>(rows: T[] | undefined, filters: CustomerAccountTabFilters) {
  return (rows || []).filter((inv) => {
    if (filters.status !== "all" && String(inv.payment_status || "").toLowerCase() !== filters.status.toLowerCase()) {
      return false;
    }
    if (!matchesPeriod(inv.invoice_date, filters)) return false;
    return matchesSearch([inv.invoice_number, inv.payment_status, inv.source].filter(Boolean).join(" "), filters);
  });
}

export function filterCreditNotes<T extends {
  credit_note_number?: string | null;
  issue_date?: string | null;
  status?: string | null;
}>(rows: T[] | undefined, filters: CustomerAccountTabFilters) {
  return (rows || []).filter((cn) => {
    if (filters.status !== "all" && String(cn.status || "").toLowerCase() !== filters.status) return false;
    if (!matchesPeriod(cn.issue_date, filters)) return false;
    return matchesSearch([cn.credit_note_number, cn.status].filter(Boolean).join(" "), filters);
  });
}

export function filterAdvances<T extends {
  advance_number?: string | null;
  advance_date?: string | null;
  status?: string | null;
  notes?: string | null;
}>(rows: T[] | undefined, filters: CustomerAccountTabFilters) {
  return (rows || []).filter((adv) => {
    if (filters.status !== "all" && String(adv.status || "").toLowerCase() !== filters.status) return false;
    if (!matchesPeriod(adv.advance_date, filters)) return false;
    return matchesSearch([adv.advance_number, adv.status].filter(Boolean).join(" "), filters);
  });
}

export function formatPeriodLabel(period: CustomerAccountPeriodFilter) {
  switch (period) {
    case "weekly":
      return "Last 7 Days";
    case "monthly":
      return "This Month";
    case "yearly":
      return "This Year";
    case "custom":
      return "Custom";
    default:
      return "All Time";
  }
}

export function formatCustomFrom(filters: CustomerAccountTabFilters) {
  return filters.dateFrom ? format(filters.dateFrom, "dd/MM/yyyy") : "From";
}

export function formatCustomTo(filters: CustomerAccountTabFilters) {
  return filters.dateTo ? format(filters.dateTo, "dd/MM/yyyy") : "To";
}
