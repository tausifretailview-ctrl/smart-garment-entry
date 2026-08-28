import { differenceInCalendarDays } from "date-fns";

/** Max inclusive calendar span for heavy client-side report scans (≈1 FY). */
export const MAX_REPORT_DATE_RANGE_DAYS = 366;

export type ReportDateRangeChunk = { from: Date; to: Date };

export function reportDateRangeSpanDays(from: Date, to: Date): number {
  if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to < from) return 0;
  return differenceInCalendarDays(to, from) + 1;
}

export function isReportDateRangeTooWide(
  from: Date,
  to: Date,
  maxDays = MAX_REPORT_DATE_RANGE_DAYS,
): boolean {
  return reportDateRangeSpanDays(from, to) > maxDays;
}

export function reportDateRangeTooWideMessage(maxDays = MAX_REPORT_DATE_RANGE_DAYS): string {
  return `Date range is too wide (max ${maxDays} days). Choose a shorter period or use a monthly filter.`;
}

/** Split a wide range into ≤maxDays chunks for paginated report fetches. */
export function splitReportDateRangeIntoChunks(
  from: Date,
  to: Date,
  maxDays = MAX_REPORT_DATE_RANGE_DAYS,
): ReportDateRangeChunk[] {
  if (!isReportDateRangeTooWide(from, to, maxDays)) {
    return [{ from, to }];
  }
  const chunks: ReportDateRangeChunk[] = [];
  let cursor = new Date(from);
  const endMs = to.getTime();
  while (cursor.getTime() <= endMs) {
    const chunkEnd = new Date(cursor);
    chunkEnd.setDate(chunkEnd.getDate() + maxDays - 1);
    if (chunkEnd.getTime() > endMs) chunkEnd.setTime(endMs);
    chunks.push({ from: new Date(cursor), to: chunkEnd });
    const next = new Date(chunkEnd);
    next.setDate(next.getDate() + 1);
    next.setHours(from.getHours(), from.getMinutes(), from.getSeconds(), from.getMilliseconds());
    cursor = next;
  }
  return chunks;
}
