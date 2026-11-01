/**
 * POS invoice-date helpers (used when "Allow invoice date change in POS" is ON).
 *
 * The POS date picker holds a local `Date` whose y/m/d is the business day
 * (see `saleDateIsoIstForDay`). A saved bill's `sale_date` is a timestamptz,
 * so its business day is the Asia/Kolkata calendar day.
 */

const IST_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** IST calendar day (yyyy-MM-dd) of a sale_date / created_at value, or "" when unreadable. */
export function istYmdOfTimestamp(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return IST_YMD.format(d);
}

/** Picker value (local midnight) for a bill's business day, or null when unreadable. */
export function posPickerDayFromSaleDate(raw: string | null | undefined): Date | null {
  const ymd = istYmdOfTimestamp(raw);
  if (!ymd) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** True when two picker dates are the same calendar day. */
export function samePickerDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return false;
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** dd/MM/yyyy for a yyyy-MM-dd day (no timezone shift). */
export function ymdToDdMmYyyy(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ymd;
}
