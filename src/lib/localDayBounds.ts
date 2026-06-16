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
