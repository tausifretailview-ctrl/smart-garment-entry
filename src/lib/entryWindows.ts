/**
 * Several windows of the same entry page (Sale Bill 1, Sale Bill 2, Sale Bill 3).
 *
 * Window 1 is the page as always (`/sales-invoice`, window id "sales-invoice"). Extra windows
 * add `?w=2` / `?w=3` to the address and get the window id "sales-invoice~2". The tab strip,
 * Alt+W switcher and Ctrl+W treat each id as its own window. Each window keeps its unsaved
 * bill when the user switches away (see useDraftSave: the resume copy carries the window).
 *
 * Only window 1 keeps the database draft (one per page per user) and "Resume Draft"; extra
 * windows keep their bill in this browser tab (survives switching and reload, not closing
 * the browser tab).
 */

export const ENTRY_WINDOW_PARAM = "w";
export const ENTRY_WINDOW_SEPARATOR = "~";

export interface MultiWindowPage {
  /** Most windows of this page open at once. */
  max: number;
  /** useDraftSave draft type, to forget a closed window's kept bill. */
  draftType: string;
}

/** Pages that can be open more than once. Purchase Bill follows in a later update. */
export const MULTI_WINDOW_PAGES: Record<string, MultiWindowPage> = {
  "sales-invoice": { max: 3, draftType: "sale_invoice" },
};

export function isMultiWindowPage(path: string): boolean {
  return Object.prototype.hasOwnProperty.call(MULTI_WINDOW_PAGES, path);
}

/** Window number from the address: 1 unless `?w=N` names an allowed extra window. */
export function entryWindowInstance(path: string, search: string | null | undefined): number {
  const page = MULTI_WINDOW_PAGES[path];
  if (!page || !search) return 1;
  try {
    const raw = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search).get(ENTRY_WINDOW_PARAM);
    const n = Number(raw);
    return Number.isInteger(n) && n >= 2 && n <= page.max ? n : 1;
  } catch {
    return 1;
  }
}

/** Window id: the page path for window 1, "path~N" for extra windows. */
export function entryWindowId(path: string, search: string | null | undefined): string {
  const n = entryWindowInstance(path, search);
  return n > 1 ? `${path}${ENTRY_WINDOW_SEPARATOR}${n}` : path;
}

export function parseEntryWindowId(id: string): { path: string; instance: number } {
  const at = id.lastIndexOf(ENTRY_WINDOW_SEPARATOR);
  if (at <= 0) return { path: id, instance: 1 };
  const path = id.slice(0, at);
  const n = Number(id.slice(at + 1));
  const page = MULTI_WINDOW_PAGES[path];
  if (!page || !Number.isInteger(n) || n < 2 || n > page.max) return { path: id, instance: 1 };
  return { path, instance: n };
}

/** Query string that opens window N of a page ("" for window 1). */
export function entryWindowSearch(instance: number): string {
  return instance > 1 ? `?${ENTRY_WINDOW_PARAM}=${instance}` : "";
}

/** Tab / switcher label: "Sales Invoice", "Sales Invoice 2", … */
export function entryWindowLabel(label: string, instance: number): string {
  return instance > 1 ? `${label} ${instance}` : label;
}

/** First free window number of a page (1…max), or null when all are open. */
export function nextFreeEntryWindow(path: string, openIds: string[]): number | null {
  const page = MULTI_WINDOW_PAGES[path];
  if (!page) return null;
  const used = new Set(
    openIds.map(parseEntryWindowId).filter((w) => w.path === path).map((w) => w.instance),
  );
  for (let n = 1; n <= page.max; n++) if (!used.has(n)) return n;
  return null;
}

/** The id of a tab record (records saved before windows had ids use their path). */
export function tabIdOf(tab: { id?: string; path: string }): string {
  return tab.id || tab.path;
}

/**
 * Windows being closed right now. A page unmounting because its window was closed must not
 * keep its bill for "when the user comes back" (useDraftSave reads this).
 */
const closingWindows = new Set<string>();

export function markEntryWindowClosing(id: string): void {
  closingWindows.add(id);
}

/** True once per close: the unmounting page asks, and the mark is cleared. */
export function takeEntryWindowClosing(id: string): boolean {
  const had = closingWindows.has(id);
  closingWindows.delete(id);
  return had;
}

/** Forget the bill kept for a closed extra window (all shops / users in this browser tab). */
export function forgetEntryWindowBill(path: string, instance: number): void {
  const page = MULTI_WINDOW_PAGES[path];
  if (!page || instance <= 1) return;
  try {
    const suffix = `:${page.draftType}:${ENTRY_WINDOW_PARAM}${instance}`;
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith("ezzy-draft-resume:") && k.endsWith(suffix)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* storage blocked */
  }
}
