/**
 * Session-scoped filter + entity persistence (per org + windowId).
 *
 * Canonical window IDs — use TAB_PAGE_REGISTRY / PAGE_CONFIG key when listed;
 * otherwise use App.tsx route segment. Examples:
 * - Tab: sales-report-by-customer (not route sales-report)
 * - Composite: accounts:customer-ledger, accounts:supplier-ledger
 */
export const WINDOW_FILTER_IDS = {
  // Tier 0 — dashboards (already wired)
  mainDashboard: "",
  posDashboard: "pos-dashboard",
  salesInvoiceDashboard: "sales-invoice-dashboard",
  // Tier 1 — tab-bar reports
  stockReport: "stock-report",
  itemWiseSales: "item-wise-sales",
  salesReportByCustomer: "sales-report-by-customer",
  purchaseReportBySupplier: "purchase-report-by-supplier",
  priceHistory: "price-history",
  productTracking: "product-tracking",
  dailyCashierReport: "daily-cashier-report",
  gstRegister: "gst-register",
  tallyExport: "tally-export",
  // Tier 2 — route-only reports
  gstReports: "gst-reports",
  accountingReports: "accounting-reports",
  itemWiseStock: "item-wise-stock",
  stockAgeing: "stock-ageing",
  expenseSalaryReport: "expense-salary-report",
  einvoiceReport: "einvoice-report",
  customerAuditReport: "customer-audit-report",
  customerLedgerReport: "customer-ledger-report",
  customerAccountStatement: "customer-account-statement",
  dailyTally: "daily-tally",
  // Tier 3 — masters
  customers: "customers",
  suppliers: "suppliers",
  employees: "employees",
  auditLog: "audit-log",
  // Tier 4 — accounts
  accounts: "accounts",
  accountsCustomerLedger: "accounts:customer-ledger",
  accountsSupplierLedger: "accounts:supplier-ledger",
  accountsExpenses: "accounts:expenses",
  accountsOutstanding: "accounts:outstanding",
  journalVouchers: "journal-vouchers",
} as const;

const STORAGE_PREFIX = "dashboard_filters_v1";
const RESTORE_GUARD_MS = 600;
let restoreGuardUntil = 0;

/** True briefly after filters are restored — skip automatic page resets in dashboard effects. */
export function isDashboardFilterRestoring(): boolean {
  return Date.now() < restoreGuardUntil;
}

export function markDashboardFilterRestoring(): void {
  restoreGuardUntil = Date.now() + RESTORE_GUARD_MS;
}

export function dashboardFilterStorageKey(orgId: string, dashboardId: string): string {
  return `${STORAGE_PREFIX}:${orgId}:${dashboardId}`;
}

export function readDashboardFilters(
  orgId: string,
  dashboardId: string,
): Record<string, unknown> | null {
  try {
    const raw = sessionStorage.getItem(dashboardFilterStorageKey(orgId, dashboardId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export function writeDashboardFilters(
  orgId: string,
  dashboardId: string,
  filters: Record<string, unknown>,
): void {
  try {
    sessionStorage.setItem(dashboardFilterStorageKey(orgId, dashboardId), JSON.stringify(filters));
  } catch {
    // Private mode / quota — ignore
  }
}

export function serializeDashboardFilters(
  filters: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (value instanceof Date) {
      out[key] = value.toISOString();
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function parsePersistedDate(value: unknown): Date | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function pickPersistedString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function pickPersistedNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function pickPersistedStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.every((item) => typeof item === "string") ? value : undefined;
}

export function pickPersistedBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Restore a customer/supplier/entity ID from session (non-empty string). */
export function pickPersistedEntityId(value: unknown): string | undefined {
  const s = pickPersistedString(value);
  return s && s !== "all" ? s : s === "all" ? "all" : undefined;
}

export type DashboardFilterRestoreConfig = {
  strings?: Array<[string, (value: string) => void]>;
  /** Customer/supplier/ledger entity IDs (same storage as strings). */
  entityIds?: Array<[string, (value: string) => void]>;
  numbers?: Array<[string, (value: number) => void]>;
  booleans?: Array<[string, (value: boolean) => void]>;
  optionalDates?: Array<[string, (value: Date | undefined) => void]>;
  requiredDates?: Array<[string, (value: Date) => void]>;
  stringArrays?: Array<[string, (value: string[]) => void]>;
  nullableStrings?: Array<[string, (value: string | null) => void]>;
};

export function restoreDashboardFilters(
  saved: Record<string, unknown>,
  config: DashboardFilterRestoreConfig,
): void {
  for (const [key, setter] of config.strings ?? []) {
    const value = pickPersistedString(saved[key]);
    if (value !== undefined) setter(value);
  }

  for (const [key, setter] of config.entityIds ?? []) {
    const value = pickPersistedEntityId(saved[key]);
    if (value !== undefined) setter(value);
  }

  for (const [key, setter] of config.booleans ?? []) {
    const value = pickPersistedBoolean(saved[key]);
    if (value !== undefined) setter(value);
  }

  for (const [key, setter] of config.numbers ?? []) {
    const value = pickPersistedNumber(saved[key]);
    if (value !== undefined) setter(value);
  }

  for (const [key, setter] of config.optionalDates ?? []) {
    if (!(key in saved)) continue;
    setter(parsePersistedDate(saved[key]));
  }

  for (const [key, setter] of config.requiredDates ?? []) {
    const value = parsePersistedDate(saved[key]);
    if (value) setter(value);
  }

  for (const [key, setter] of config.stringArrays ?? []) {
    const value = pickPersistedStringArray(saved[key]);
    if (value !== undefined) setter(value);
  }

  for (const [key, setter] of config.nullableStrings ?? []) {
    if (!(key in saved)) continue;
    const raw = saved[key];
    setter(raw === null ? null : pickPersistedString(raw) ?? null);
  }
}
