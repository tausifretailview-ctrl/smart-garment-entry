import { saleRowCalendarYmd } from "@/lib/localDayBounds";

/** Fired after a POS sale is saved/updated so cached POS Dashboard refetches. */
export const POS_SALES_REFRESH_EVENT = "pos-sales-data-changed";

/** Request cursor in the POS barcode scan field (e.g. after New Sale). */
export const POS_FOCUS_BARCODE_EVENT = "pos-sales-focus-barcode";

export type PosSalesChangedDetail = {
  organizationId?: string;
  /** ISO timestamp of the saved sale — dashboard may snap daily filter to this day. */
  saleDate?: string;
  saleNumber?: string;
};

type PendingPosSalesRefresh = PosSalesChangedDetail & {
  ts: number;
};

const PENDING_POS_REFRESH_KEY = "pos_sales_pending_refresh_v1";
/** Cross-tab marker — storage events fire in other tabs on the same machine. */
export const MONEY_VIEW_FRESHNESS_LS_KEY = "money_view_freshness_v1";
/** Per-tab watermark so the tab that wrote the marker does not apply it again. */
const MONEY_VIEW_FRESHNESS_APPLIED_SESSION_KEY = "money_view_freshness_applied_ts_v1";
/** Ignore a freshness marker older than this when a hidden tab wakes up. */
export const MONEY_VIEW_FRESHNESS_MAX_AGE_MS = 10 * 60 * 1000;
/** Ignore stale pending markers after this window (tab switch / filter snap). */
const PENDING_POS_REFRESH_TTL_MS = 10 * 60 * 1000;

type MoneyFreshnessMarker = PosSalesChangedDetail & {
  ts: number;
};

function writeMoneyFreshnessMarker(detail: PosSalesChangedDetail): void {
  if (typeof localStorage === "undefined") return;
  try {
    const payload: MoneyFreshnessMarker = { ...detail, ts: Date.now() };
    localStorage.setItem(MONEY_VIEW_FRESHNESS_LS_KEY, JSON.stringify(payload));
    markMoneyFreshnessApplied(payload.ts);
  } catch {
    // quota / private mode
  }
}

export function readStoredMoneyFreshnessMarker(): MoneyFreshnessMarker | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(MONEY_VIEW_FRESHNESS_LS_KEY);
    if (!raw) return null;
    return parseMoneyFreshnessMarker(raw);
  } catch {
    return null;
  }
}

export function readAppliedMoneyFreshnessTs(): number {
  if (typeof sessionStorage === "undefined") return 0;
  try {
    const n = Number(sessionStorage.getItem(MONEY_VIEW_FRESHNESS_APPLIED_SESSION_KEY));
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

export function markMoneyFreshnessApplied(ts: number): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(MONEY_VIEW_FRESHNESS_APPLIED_SESSION_KEY, String(ts));
  } catch {
    // quota / private mode
  }
}

/**
 * A background Chrome tab often misses the storage event (timer throttle or
 * discard). Apply the marker once when that tab wakes, if it is still recent.
 */
export function shouldApplyMoneyFreshnessMarker(
  marker: { ts?: number; organizationId?: string } | null,
  opts: { organizationId?: string; lastAppliedTs: number; now?: number; maxAgeMs?: number },
): boolean {
  if (!marker || typeof marker.ts !== "number") return false;
  if (opts.organizationId && marker.organizationId && marker.organizationId !== opts.organizationId) {
    return false;
  }
  if (marker.ts <= opts.lastAppliedTs) return false;
  const now = opts.now ?? Date.now();
  const maxAge = opts.maxAgeMs ?? MONEY_VIEW_FRESHNESS_MAX_AGE_MS;
  if (now - marker.ts > maxAge) return false;
  return true;
}

export function parseMoneyFreshnessMarker(raw: string): MoneyFreshnessMarker | null {
  try {
    const parsed = JSON.parse(raw) as MoneyFreshnessMarker;
    if (!parsed || typeof parsed.ts !== "number") return null;
    return parsed;
  } catch {
    return null;
  }
}

function readPendingRaw(): PendingPosSalesRefresh | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(PENDING_POS_REFRESH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PendingPosSalesRefresh;
    if (!parsed || typeof parsed.ts !== "number") return null;
    if (Date.now() - parsed.ts > PENDING_POS_REFRESH_TTL_MS) {
      sessionStorage.removeItem(PENDING_POS_REFRESH_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writePending(detail: PosSalesChangedDetail): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    const payload: PendingPosSalesRefresh = { ...detail, ts: Date.now() };
    sessionStorage.setItem(PENDING_POS_REFRESH_KEY, JSON.stringify(payload));
  } catch {
    // quota / private mode
  }
}

function clearPending(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(PENDING_POS_REFRESH_KEY);
  } catch {
    // ignore
  }
}

/** Peek without clearing — used by the live event listener on an open dashboard. */
export function peekPendingPosSalesRefresh(
  organizationId?: string,
): PosSalesChangedDetail | null {
  const pending = readPendingRaw();
  if (!pending) return null;
  if (organizationId && pending.organizationId && pending.organizationId !== organizationId) {
    return null;
  }
  const { ts: _ts, ...detail } = pending;
  return detail;
}

/** Read + clear pending refresh (dashboard tab activation after save on POS). */
export function consumePendingPosSalesRefresh(
  organizationId?: string,
): PosSalesChangedDetail | null {
  const pending = peekPendingPosSalesRefresh(organizationId);
  if (!pending) return null;
  clearPending();
  return pending;
}

/** Calendar yyyy-MM-dd for snapping the daily filter to the saved bill. */
export function posSaleDateToLocalYmd(saleDate?: string | null): string {
  if (!saleDate) return "";
  return saleRowCalendarYmd({ sale_date: saleDate });
}

export function notifyPosSalesChanged(detail?: PosSalesChangedDetail) {
  if (typeof window === "undefined") return;
  const payload = detail ?? {};
  writePending(payload);
  writeMoneyFreshnessMarker(payload);
  window.dispatchEvent(
    new CustomEvent(POS_SALES_REFRESH_EVENT, { detail: payload }),
  );
}

/** Cross-tab hint after receipt/advance/CN (localStorage). Other PCs use Realtime. */
export function notifyMoneyViewChanged(detail?: PosSalesChangedDetail) {
  if (typeof window === "undefined") return;
  writeMoneyFreshnessMarker(detail ?? {});
}

export function requestPosBarcodeFocus() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(POS_FOCUS_BARCODE_EVENT));
}
