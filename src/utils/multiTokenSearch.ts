/**
 * Multi-token AND search utility.
 * Splits the query into space-separated tokens and checks that
 * every token appears somewhere in the combined haystack string.
 */
export function multiTokenMatch(query: string, ...fields: (string | number | null | undefined)[]): boolean {
  if (!query || !query.trim()) return true;
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = fields.map(f => (f != null ? String(f) : '')).join(' ').toLowerCase();
  return tokens.every(token => haystack.includes(token));
}
