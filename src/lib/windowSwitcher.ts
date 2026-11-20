/**
 * Window switcher (Alt+W, like Windows Alt+Tab): the open windows of the tab strip, most
 * recently used first. Hold Alt and tap W to move along, release Alt to open the chosen one.
 */
export const WINDOW_SWITCHER_KEY = "w";
export const RECENT_MAX = 20;

/** Most recent first, no repeats. */
export function touchRecent(order: string[], path: string, max = RECENT_MAX): string[] {
  return [path, ...order.filter((p) => p !== path)].slice(0, max);
}

/** Window id: "path~N" for extra windows of a page (Sale Bill 2), else the path. */
const idOf = (w: { id?: string; path: string }) => w.id || w.path;

/** Open windows sorted by last use (never-used ones keep their strip order, at the end). */
export function orderByRecent<T extends { path: string; id?: string }>(windows: T[], recent: string[]): T[] {
  const rank = new Map(recent.map((p, i) => [p, i]));
  return windows
    .map((w, i) => ({ w, i, r: rank.has(idOf(w)) ? (rank.get(idOf(w)) as number) : Number.MAX_SAFE_INTEGER }))
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map((x) => x.w);
}

export function stepIndex(index: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((index + delta) % count) + count) % count;
}

/** First selection when the switcher opens: the window used before this one (Alt+Tab habit). */
export function initialSelection(count: number): number {
  return count > 1 ? 1 : 0;
}

/** "Just now", "2 min ago", "1 h ago", "Yesterday"; empty when unknown. */
export function lastUsedLabel(at: number | undefined, now: number): string {
  if (!at) return "";
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return "Just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return h < 48 ? "Yesterday" : `${Math.round(h / 24)} days ago`;
}

/** What a window was showing, from its saved query string, for the card's second line. */
export function windowDetail(path: string, search?: string): string {
  if (!search) return "";
  try {
    const sp = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
    if (sp.get("id") || sp.get("saleId") || sp.get("billId") || sp.get("edit")) return "Editing a saved entry";
    const tab = sp.get("tab");
    if (tab) return tab.replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  } catch {
    /* malformed query: nothing to show */
  }
  return "";
}

/** The current window always first, whatever the recent list says (it can lag a render behind). */
export function withCurrentFirst<T extends { path: string; id?: string }>(windows: T[], currentId: string): T[] {
  const i = windows.findIndex((w) => idOf(w) === currentId);
  if (i <= 0) return windows;
  return [windows[i], ...windows.slice(0, i), ...windows.slice(i + 1)];
}
