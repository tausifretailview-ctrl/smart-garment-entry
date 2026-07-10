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
/** Ignore stale pending markers after this window (tab switch / filter snap). */
const PENDING_POS_REFRESH_TTL_MS = 10 * 60 * 1000;

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
  window.dispatchEvent(
    new CustomEvent(POS_SALES_REFRESH_EVENT, { detail: payload }),
  );
}

export function requestPosBarcodeFocus() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(POS_FOCUS_BARCODE_EVENT));
}
