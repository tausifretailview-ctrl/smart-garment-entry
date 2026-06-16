import { format } from "date-fns";

/**
 * Local calendar yyyy-MM-dd → UTC ISO start/end for timestamptz `sale_date` filters.
 * Avoids missing early-morning POS bills when DB stores UTC (e.g. 12:59 AM IST → prior UTC day).
 */
export function localDayStartUtcIso(ymd: string): string | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).toISOString();
}

export function localDayEndUtcIso(ymd: string): string | null {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).toISOString();
}

export function localDayBounds(startYmd: string, endYmd: string): {
  startIso: string;
  endIso: string;
} {
  const startIso = localDayStartUtcIso(startYmd) ?? `${startYmd}T00:00:00.000Z`;
  const endIso = localDayEndUtcIso(endYmd) ?? `${endYmd}T23:59:59.999Z`;
  return { startIso, endIso };
}

/** Calendar yyyy-MM-dd for a sale row (browser local timezone). */
export function saleRowCalendarYmd(sale: {
  sale_date?: string | null;
  created_at?: string | null;
}): string {
  const raw = sale.sale_date || sale.created_at;
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dt = new Date(s);
  if (Number.isNaN(dt.getTime())) return "";
  return format(dt, "yyyy-MM-dd");
}

export function todayLocalYmd(): string {
  return format(new Date(), "yyyy-MM-dd");
}

/** Wall-clock "now" in Asia/Kolkata (same pattern as FY / sale-number logic). */
export function istNowDate(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
}

/** Business sale_date timestamptz — IST wall clock with +05:30 offset. */
export function saleDateIsoIst(): string {
  const d = istNowDate();
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}+05:30`;
}

/** Ledger/voucher txn date — IST calendar day YYYY-MM-DD. */
export function istCalendarYmd(): string {
  const d = istNowDate();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/*
 * DATA CHECK (review before any correction — shifts which day revenue counts on):
 * SELECT id, sale_number, sale_date, created_at,
 *   (sale_date AT TIME ZONE 'Asia/Kolkata')::date AS sale_date_ist,
 *   (created_at AT TIME ZONE 'Asia/Kolkata')::date AS created_ist
 * FROM sales
 * WHERE deleted_at IS NULL
 *   AND sale_type = 'pos'
 *   AND (sale_date AT TIME ZONE 'Asia/Kolkata')::date
 *       <> (created_at AT TIME ZONE 'Asia/Kolkata')::date
 *   AND EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Kolkata') < 5.5;
 */

const IST_DISPLAY_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** Display sale/invoice timestamps in IST (Asia/Kolkata). */
export function formatTimestampIST(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return IST_DISPLAY_FORMATTER.format(d);
}
