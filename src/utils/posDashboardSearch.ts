/** Pure helpers for POS dashboard sale search (invoice number vs line-item matching). */

/** Numeric-only input that likely targets an invoice serial (e.g. "1029" → POS/26-27/1029). */
export function looksLikeInvoiceSequence(search: string): boolean {
  const t = search.trim();
  return /^\d{1,6}$/.test(t);
}

/** True when line-item union search should run (barcode / product name). */
export function shouldUnionSaleItemsForPosSearch(searchStr: string): boolean {
  const t = searchStr.trim();
  if (!t) return false;
  // Pure invoice serials should match sale_number first — skip noisy line-item union.
  if (looksLikeInvoiceSequence(t)) return false;
  if (/^\d+$/.test(t)) return t.length >= 4;
  return /[A-Za-z]/.test(t) && t.length >= 3;
}

/** PostgREST `.or()` filter for sale header text search. */
export function buildPosSaleHeaderSearchFilter(search: string): string {
  const t = search.trim();
  const parts = [
    `sale_number.ilike.%${t}%`,
    `customer_name.ilike.%${t}%`,
    `customer_phone.ilike.%${t}%`,
  ];
  if (looksLikeInvoiceSequence(t)) {
    // Prefer suffix match: POS/26-27/1029 ends with /1029
    parts.unshift(`sale_number.ilike.%/${t}`);
  }
  return parts.join(",");
}

/** Rank sale rows so exact invoice serial matches appear before substring / line-item hits. */
export function rankPosDashboardSearchResults<T extends { sale_number?: string | null; sale_date?: string | null }>(
  rows: T[],
  search: string,
): T[] {
  const t = search.trim();
  if (!t || rows.length <= 1) return rows;

  const score = (row: T): number => {
    const num = (row.sale_number || "").toLowerCase();
    const q = t.toLowerCase();
    if (!num) return 0;
    if (num.endsWith(`/${q}`)) return 100;
    if (num.includes(`/${q}/`)) return 90;
    if (num.includes(q)) return 50;
    return 0;
  };

  return [...rows].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    const aDate = a.sale_date ? new Date(a.sale_date).getTime() : 0;
    const bDate = b.sale_date ? new Date(b.sale_date).getTime() : 0;
    return bDate - aDate;
  });
}
