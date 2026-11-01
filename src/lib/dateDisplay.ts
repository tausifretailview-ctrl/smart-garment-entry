import { format } from "date-fns";

/**
 * Shop-facing date display: always dd/mm/yyyy (Indian order), never the
 * browser/OS locale (toLocaleDateString() follows Chrome's language, which is
 * often English (United States) → month first).
 */

/** "2026-10-31" → "31/10/2026". Anything else is returned unchanged ("" stays ""). */
export function ymdToDdMmYyyy(ymd: string | null | undefined): string {
  const s = String(ymd ?? "");
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

/** Up to 8 typed digits → "dd", "dd/mm", "dd/mm/yyyy" progressively. */
export function maskDdMmYyyyDigits(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 8);
  if (d.length > 4) return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
  if (d.length > 2) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return d;
}

/** "31102026" → "2026-10-31"; null when not a real calendar day. */
export function ddMmYyyyDigitsToYmd(digits: string): string | null {
  const d = digits.replace(/\D/g, "");
  if (d.length !== 8) return null;
  const day = Number(d.slice(0, 2));
  const month = Number(d.slice(2, 4));
  const year = Number(d.slice(4));
  if (year < 1900 || month < 1 || month > 12 || day < 1) return null;
  const check = new Date(year, month - 1, day);
  if (check.getFullYear() !== year || check.getMonth() !== month - 1 || check.getDate() !== day) {
    return null;
  }
  return `${d.slice(4)}-${d.slice(2, 4)}-${d.slice(0, 2)}`;
}

function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const dt = value instanceof Date ? value : new Date(value);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

/** Any date / ISO string → "dd/MM/yyyy" ("" when empty or invalid). */
export function formatDateDMY(value: string | number | Date | null | undefined): string {
  const dt = toDate(value);
  return dt ? format(dt, "dd/MM/yyyy") : "";
}

/** Any date / ISO string → "dd/MM/yyyy hh:mm a" ("" when empty or invalid). */
export function formatDateTimeDMY(value: string | number | Date | null | undefined): string {
  const dt = toDate(value);
  return dt ? format(dt, "dd/MM/yyyy hh:mm a") : "";
}
