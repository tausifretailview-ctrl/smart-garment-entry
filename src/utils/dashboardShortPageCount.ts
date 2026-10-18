/**
 * Searched dashboards: when the page came back with fewer rows than asked for
 * (but not empty), it is the last page, so the total is known without running
 * the separate count query. That count was the slowest bill-search query in
 * pg_stat_statements (avg ~700 ms, 18 Oct 2026). Returns null when a count is
 * still needed (full page, or an empty page past the first).
 */
export function totalFromShortPage(
  from: number,
  rowsReturned: number,
  pageSize: number,
): number | null {
  if (rowsReturned <= 0) return from === 0 ? 0 : null;
  if (rowsReturned < pageSize) return from + rowsReturned;
  return null;
}
