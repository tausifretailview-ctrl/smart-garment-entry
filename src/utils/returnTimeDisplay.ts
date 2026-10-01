import { format } from "date-fns";

/**
 * Sale return / credit note date columns (`return_date`, `issue_date`) hold a calendar day,
 * not a moment. `new Date("2026-10-01")` is midnight UTC, which a +05:30 browser prints as
 * 05:30 AM. Real times come from `created_at`.
 */

/** "hh:mm a" of a real timestamp, or "" when missing / invalid. */
export function formatReturnTime(createdAt: string | null | undefined): string {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return "";
  return format(d, "hh:mm a");
}

/** True for a bare date (`2026-10-01`) or a date stored as midnight UTC. */
export function isDateOnlyTimestamp(ts: string | null | undefined): boolean {
  if (!ts) return false;
  const s = String(ts).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) || /^\d{4}-\d{2}-\d{2}[T ]00:00:00(\.0+)?(Z|\+00(:?00)?)?$/.test(s);
}

export type TimelineStamp = {
  /** Sortable ISO-ish string. */
  timestamp: string;
  /** False when only the calendar day is known — show the date without a clock time. */
  hasTime: boolean;
};

/**
 * Choose what to show for an event: the real creation instant when we have one, otherwise the
 * calendar day (never an invented clock time such as 05:30 AM or 12:00 PM).
 */
export function resolveEventStamp(
  createdAt: string | null | undefined,
  dateOnly: string | null | undefined,
): TimelineStamp | null {
  if (createdAt && !Number.isNaN(new Date(createdAt).getTime()) && !isDateOnlyTimestamp(createdAt)) {
    return { timestamp: createdAt, hasTime: true };
  }
  if (dateOnly) {
    const day = String(dateOnly).slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return { timestamp: `${day}T12:00:00`, hasTime: false };
  }
  return null;
}

export function formatTimelineStamp(stamp: TimelineStamp): string {
  const d = new Date(stamp.timestamp);
  if (Number.isNaN(d.getTime())) return stamp.timestamp;
  return format(d, stamp.hasTime ? "dd-MMM hh:mm a" : "dd-MMM");
}
