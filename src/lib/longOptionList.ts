/**
 * Pick lists with thousands of entries (all customers, all products) drew one row per entry
 * each time they opened, and again on every key typed in their search box: seconds of
 * freeze in a shop with a few thousand customers (speed review item S6).
 *
 * The lists now draw at most LONG_LIST_SHOWN rows. The search still looks through every
 * entry, so anything can be reached by typing a few letters.
 */
export const LONG_LIST_SHOWN = 100;

/** Lower-cased words of what was typed; an entry matches when it contains every word. */
export function searchWords(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean);
}

export function matchesAllWords(haystackLower: string, words: readonly string[]): boolean {
  for (const word of words) if (!haystackLower.includes(word)) return false;
  return true;
}

export type CappedList<T> = {
  /** The rows to draw, at most `limit`. */
  shown: T[];
  /** How many entries match the search in all. */
  total: number;
};

/**
 * The first `limit` entries matching `query`. `haystacks[i]` is the lower-cased search text
 * of `items[i]`. With no search, the chosen entry (`pinnedIndex`) is put first so it is on
 * screen even when it sits beyond the limit.
 */
export function capMatches<T>(
  items: readonly T[],
  haystacks: readonly string[],
  query: string,
  limit: number = LONG_LIST_SHOWN,
  pinnedIndex = -1,
): CappedList<T> {
  const words = searchWords(query);
  const shown: T[] = [];
  let total = 0;
  const pinned = words.length === 0 && pinnedIndex >= 0 && pinnedIndex < items.length;
  if (pinned) shown.push(items[pinnedIndex]);
  for (let i = 0; i < items.length; i++) {
    if (words.length > 0 && !matchesAllWords(haystacks[i] ?? "", words)) continue;
    total += 1;
    if (pinned && i === pinnedIndex) continue;
    if (shown.length < limit) shown.push(items[i]);
  }
  return { shown, total };
}

/** "Showing 100 of 4,321. Type to narrow." or null when everything is on screen. */
export function cappedListNote(shownCount: number, total: number): string | null {
  if (total <= shownCount) return null;
  return `Showing ${shownCount.toLocaleString("en-IN")} of ${total.toLocaleString("en-IN")}. Type to narrow.`;
}
