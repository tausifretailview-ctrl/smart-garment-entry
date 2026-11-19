/**
 * Esc = step back through the pages this browser tab visited (newest first), like a browser's
 * Back button but inside the shop only: Purchase Bill → Sale Bill → Payments, Esc → Sale Bill,
 * Esc → Purchase Bill. When there is no earlier page (just logged in, or the list is used up)
 * the page's usual parent from BACK_MAP is used, as before.
 *
 * The list lives in sessionStorage (per browser tab, per shop) and holds page paths after the
 * shop slug, with the page's last query string (so an invoice opened for edit reopens).
 */
export const ESC_HISTORY_MAX = 30;
const STORAGE_PREFIX = "ezzy-esc-history-v1:";

export type EscHistoryEntry = { path: string; search: string };

/** Page path after the shop slug: "/krishna/sales-invoice" → "sales-invoice"; home → "". */
export function pagePathAfterSlug(pathname: string, orgSlug: string | null | undefined): string {
  const parts = pathname.split("/").filter(Boolean);
  if (orgSlug && parts[0] === orgSlug) parts.shift();
  return parts.join("/");
}

/**
 * Record arriving on a page.
 * - Same page as the newest entry: only its query string is updated (filters, ?id=).
 * - Arriving because Esc stepped back: the page left is dropped instead of adding a new entry.
 * - Otherwise the page is added on top (the list keeps the newest ESC_HISTORY_MAX pages).
 */
export function recordVisit(
  stack: EscHistoryEntry[],
  entry: EscHistoryEntry,
  steppingBack: boolean,
  max = ESC_HISTORY_MAX,
): EscHistoryEntry[] {
  const top = stack[stack.length - 1];
  if (top && top.path === entry.path) {
    return top.search === entry.search ? stack : [...stack.slice(0, -1), entry];
  }
  if (steppingBack) {
    const below = stack[stack.length - 2];
    if (below && below.path === entry.path) return [...stack.slice(0, -2), entry];
  }
  return [...stack, entry].slice(-max);
}

/** The page Esc should open from the current one, or null when there is no earlier page. */
export function previousEntry(stack: EscHistoryEntry[], currentPath: string): EscHistoryEntry | null {
  const top = stack[stack.length - 1];
  if (!top || top.path !== currentPath) return null;
  for (let i = stack.length - 2; i >= 0; i -= 1) {
    if (stack[i].path !== currentPath) return stack[i];
  }
  return null;
}

/** "sales-invoice" + "?id=1" → "/sales-invoice?id=1"; home → "/". */
export function entryHref(entry: EscHistoryEntry): string {
  return `/${entry.path}${entry.search}`;
}

function key(orgSlug: string) {
  return `${STORAGE_PREFIX}${orgSlug}`;
}

export function readEscHistory(orgSlug: string): EscHistoryEntry[] {
  try {
    const raw = JSON.parse(window.sessionStorage.getItem(key(orgSlug)) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter((e) => e && typeof e.path === "string" && typeof e.search === "string")
      .map((e) => ({ path: e.path.slice(0, 200), search: e.search.slice(0, 500) }))
      .slice(-ESC_HISTORY_MAX);
  } catch {
    return [];
  }
}

export function writeEscHistory(orgSlug: string, stack: EscHistoryEntry[]): void {
  try {
    window.sessionStorage.setItem(key(orgSlug), JSON.stringify(stack.slice(-ESC_HISTORY_MAX)));
  } catch {
    /* storage blocked — Esc falls back to each page's usual parent */
  }
}

/** Set just before Esc navigates, so the next recorded visit drops the page left behind. */
let steppingBack = false;
export function markSteppingBack(): void {
  steppingBack = true;
}
export function consumeSteppingBack(): boolean {
  const was = steppingBack;
  steppingBack = false;
  return was;
}

/**
 * Where Esc should go from this page by history, and marks the step so it is not recorded as
 * a new visit. Null when there is no earlier page (the caller then uses its usual parent).
 */
export function takeEscBackTarget(orgSlug: string, pathname: string): string | null {
  const current = pagePathAfterSlug(pathname, orgSlug);
  const prev = previousEntry(readEscHistory(orgSlug), current);
  if (!prev) return null;
  markSteppingBack();
  return entryHref(prev);
}
