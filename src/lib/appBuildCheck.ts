/**
 * Deploy-skew check for a tab stuck on its loading shell.
 * The open page runs one build; the server may already have a newer one whose files
 * replaced ours, so the screen's chunk never arrives until the user hard-refreshes.
 * Compare the entry script the server serves now with the one this page booted from.
 */

const ENTRY_RE = /\/assets\/index-[A-Za-z0-9_-]+\.js/;
const AUTO_RELOAD_KEY = "ezzy_tab_load_newer_build_reload";

/** Entry script path (e.g. /assets/index-AbC123.js) in an HTML string, or null. */
export function entryScriptFromHtml(html: string): string | null {
  const m = html.match(ENTRY_RE);
  return m ? m[0] : null;
}

/** Entry script this page booted from, or null when it cannot be read. */
export function currentEntryScript(doc: Document | undefined = typeof document !== "undefined" ? document : undefined): string | null {
  if (!doc) return null;
  const el = doc.querySelector('script[type="module"][src*="/assets/index-"]') as HTMLScriptElement | null;
  const src = el?.getAttribute("src") || "";
  const m = src.match(ENTRY_RE);
  return m ? m[0] : null;
}

/**
 * The server's entry script when it differs from ours; null when same, unreadable,
 * offline or on any error (never forces a reload on doubt).
 */
export async function newerServerEntryScript(
  fetchImpl: typeof fetch = fetch,
  running: string | null = currentEntryScript(),
): Promise<string | null> {
  if (!running) return null;
  try {
    const res = await fetchImpl("/index.html", { cache: "no-store" });
    if (!res.ok) return null;
    const server = entryScriptFromHtml(await res.text());
    if (!server || server === running) return null;
    return server;
  } catch {
    return null;
  }
}

/**
 * True at most once per server build: records the server entry before reloading, so a
 * reload that still lands on the old build (cache, proxy) never loops.
 */
export function claimNewerBuildReload(serverEntry: string, storage: Pick<Storage, "getItem" | "setItem"> | null = safeSession()): boolean {
  if (!storage) return false;
  try {
    if (storage.getItem(AUTO_RELOAD_KEY) === serverEntry) return false;
    storage.setItem(AUTO_RELOAD_KEY, serverEntry);
    return true;
  } catch {
    return false;
  }
}

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage !== "undefined" ? sessionStorage : null;
  } catch {
    return null;
  }
}
