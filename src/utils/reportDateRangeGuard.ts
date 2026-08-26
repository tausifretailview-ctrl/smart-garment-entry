/** Max inclusive calendar span for heavy client-side report scans (≈1 FY). */
export const MAX_REPORT_DATE_RANGE_DAYS = 366;

export function reportDateRangeSpanDays(from: Date, to: Date): number {
  const start = from.getTime();
  const end = to.getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.ceil((end - start) / (24 * 60 * 60 * 1000)) + 1;
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
