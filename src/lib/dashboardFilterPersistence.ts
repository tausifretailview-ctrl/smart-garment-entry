import { format } from "date-fns";

/**
 * Page filter persistence (per org + user + windowId).
 *
 * Storage: localStorage (survives tab close and the 5-min pane retention window).
 * Namespaced so org/user switches never leak another shop's or user's filters.
 *
 * Canonical window IDs — use TAB_PAGE_REGISTRY / PAGE_CONFIG key when listed;
 * otherwise use App.tsx route segment. Examples:
 * - Tab: sales-report-by-customer (not route sales-report)
 * - Composite: accounts:customer-ledger, accounts:supplier-ledger
 *
 * Scroll position is intentionally NOT persisted — a wrong restore on dense
 * tables is worse than none (react-virtual is available but unused on desktop).
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

const STORAGE_PREFIX_V2 = "dashboard_filters_v2";
/** Legacy sessionStorage prefix (org-only) — read once and migrate. */
const STORAGE_PREFIX_V1 = "dashboard_filters_v1";

const RESTORE_GUARD_MS = 600;
let restoreGuardUntil = 0;

/** Absolute date fields cleared when the saved calendar day is not today (unless custom). */
export const PERSISTED_DATE_FIELD_KEYS = [
  "startDate",
  "endDate",
  "fromDate",
  "toDate",
  "dateFrom",
  "dateTo",
  "selectedDate",
  "voucherDate",
  "paymentDate",
] as const;

/** Period/intent values that mean "relative to today" — keep intent, drop frozen dates. */
const RELATIVE_PERIOD_VALUES = new Set([
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
  "all",
  "today",
  "yesterday",
  "last7",
  "last30",
  "this_month",
  "this_quarter",
  "this_year",
]);

/** True briefly after filters are restored — skip automatic page resets in dashboard effects. */
export function isDashboardFilterRestoring(): boolean {
  return Date.now() < restoreGuardUntil;
}

export function markDashboardFilterRestoring(): void {
  restoreGuardUntil = Date.now() + RESTORE_GUARD_MS;
}

export function todayLocalYmd(now: Date = new Date()): string {
  return format(now, "yyyy-MM-dd");
}

export function dashboardFilterStorageKey(
  orgId: string,
  userId: string,
  dashboardId: string,
): string {
  if (!orgId || !userId || !dashboardId) {
    throw new Error("dashboardFilterStorageKey requires orgId, userId, and dashboardId");
  }
  return `${STORAGE_PREFIX_V2}:${orgId}:${userId}:${dashboardId}`;
}

/** Reject empty / literal "undefined" / "null" user ids before any storage I/O. */
export function isUsablePersistenceUserId(userId: string | null | undefined): userId is string {
  return typeof userId === "string" && userId.length > 0 && userId !== "undefined" && userId !== "null";
}

function legacySessionStorageKey(orgId: string, dashboardId: string): string {
  return `${STORAGE_PREFIX_V1}:${orgId}:${dashboardId}`;
}

function parseStoredObject(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function stripMeta(raw: Record<string, unknown>): {
  filters: Record<string, unknown>;
  savedOn: string | null;
} {
  const savedOn = typeof raw._savedOn === "string" ? raw._savedOn : null;
  const filters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key === "_v" || key === "_savedOn") continue;
    filters[key] = value;
  }
  return { filters, savedOn };
}

function ymdPrefix(value: unknown): string | null {
  if (typeof value !== "string" || value.length < 10) return null;
  const ymd = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null;
}

/**
 * Drop frozen absolute dates when the snapshot was saved on a prior calendar day,
 * unless the user explicitly chose a custom range. Relative period intent is kept.
 */
export function sanitizePersistedFiltersForToday(
  raw: Record<string, unknown>,
  now: Date = new Date(),
): Record<string, unknown> {
  const { filters, savedOn } = stripMeta(raw);
  const today = todayLocalYmd(now);

  if (!savedOn || savedOn === today) {
    return filters;
  }

  const period =
    (typeof filters.periodFilter === "string" && filters.periodFilter) ||
    (typeof filters.dateRange === "string" && filters.dateRange) ||
    (typeof filters.dateRangeType === "string" && filters.dateRangeType) ||
    null;

  if (period === "custom") {
    return filters;
  }

  const dropDates = () => {
    const out = { ...filters };
    for (const key of PERSISTED_DATE_FIELD_KEYS) {
      delete out[key];
    }
    return out;
  };

  if (period && RELATIVE_PERIOD_VALUES.has(period)) {
    return dropDates();
  }

  // Legacy / no period: if range was exactly the saved calendar day ("today" then), drop it.
  const startYmd = ymdPrefix(filters.startDate);
  const endYmd = ymdPrefix(filters.endDate);
  if (startYmd === savedOn && (endYmd === savedOn || endYmd == null)) {
    return dropDates();
  }

  return filters;
}

function readLegacySessionFilters(
  orgId: string,
  dashboardId: string,
): Record<string, unknown> | null {
  try {
    return parseStoredObject(sessionStorage.getItem(legacySessionStorageKey(orgId, dashboardId)));
  } catch {
    return null;
  }
}

function removeLegacySessionFilters(orgId: string, dashboardId: string): void {
  try {
    sessionStorage.removeItem(legacySessionStorageKey(orgId, dashboardId));
  } catch {
    // ignore
  }
}

export function readDashboardFilters(
  orgId: string,
  dashboardId: string,
  userId?: string | null,
): Record<string, unknown> | null {
  if (!orgId || !dashboardId) return null;

  // Never read/write under …:undefined:… — wait for a real user id.
  if (!isUsablePersistenceUserId(userId)) {
    return null;
  }

  try {
    const fromLocal = parseStoredObject(
      localStorage.getItem(dashboardFilterStorageKey(orgId, userId, dashboardId)),
    );
    if (fromLocal) {
      return sanitizePersistedFiltersForToday(fromLocal);
    }
  } catch {
    // Private mode — fall through to legacy
  }

  // One-time migrate: sessionStorage v1 (org-only) → localStorage v2 (org+user).
  const legacy = readLegacySessionFilters(orgId, dashboardId);
  if (!legacy) return null;

  const sanitized = sanitizePersistedFiltersForToday({
    ...legacy,
    // Treat legacy as saved today so we don't strip mid-session dates on migrate.
    _savedOn: todayLocalYmd(),
  });

  writeDashboardFilters(orgId, dashboardId, sanitized, userId);
  removeLegacySessionFilters(orgId, dashboardId);

  return sanitized;
}

/** Purchase Bills — read saved filters (canonical + legacy dashboard id). */
export function readPurchaseBillDashboardFilters(
  orgId: string | undefined,
  userId?: string | null,
): Record<string, unknown> | null {
  if (!orgId) return null;
  return (
    readDashboardFilters(orgId, "purchase-bills", userId) ??
    readDashboardFilters(orgId, "purchase-bill-dashboard", userId)
  );
}

export function writeDashboardFilters(
  orgId: string,
  dashboardId: string,
  filters: Record<string, unknown>,
  userId?: string | null,
): void {
  if (!orgId || !dashboardId || !isUsablePersistenceUserId(userId)) return;
  try {
    const payload = {
      _v: 2,
      _savedOn: todayLocalYmd(),
      ...filters,
    };
    localStorage.setItem(
      dashboardFilterStorageKey(orgId, userId, dashboardId),
      JSON.stringify(payload),
    );
  } catch {
    // Private mode / quota — ignore
  }
}

/** Clear persisted filters for this org+user+page (Reset filters). */
export function clearDashboardFilters(
  orgId: string,
  dashboardId: string,
  userId?: string | null,
): void {
  if (!orgId || !dashboardId) return;
  if (isUsablePersistenceUserId(userId)) {
    try {
      localStorage.removeItem(dashboardFilterStorageKey(orgId, userId, dashboardId));
    } catch {
      // ignore
    }
  }
  removeLegacySessionFilters(orgId, dashboardId);
  // Purchase bills dual id
  if (dashboardId === "purchase-bills") {
    removeLegacySessionFilters(orgId, "purchase-bill-dashboard");
    if (isUsablePersistenceUserId(userId)) {
      try {
        localStorage.removeItem(
          dashboardFilterStorageKey(orgId, userId, "purchase-bill-dashboard"),
        );
      } catch {
        // ignore
      }
    }
  }
}

export function serializeDashboardFilters(
  filters: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined) continue;
    if (key === "_v" || key === "_savedOn") continue;
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

/** Restore a customer/supplier/entity ID from storage (non-empty string). */
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
