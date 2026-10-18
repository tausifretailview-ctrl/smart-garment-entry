/**
 * "Why did the app reload?" — every automatic reload records its reason here
 * just before it fires. On the next page load the record is moved into a small
 * history and printed once as a console warning, so a shop that says "the app
 * reloaded by itself" can open DevTools and see which path did it.
 *
 * Also notes Chrome tab discards (Memory Saver / low RAM): those look exactly
 * like a reload to the shop, but no app code runs.
 *
 *   window.__ezzyReloads.print()   // last 20 page loads and their reason
 */

const PENDING_KEY = "ezzy_reload_pending";
const HISTORY_KEY = "ezzy_reload_history";
const HISTORY_MAX = 20;
/** A pending reason older than this belongs to an earlier, unrelated load. */
const PENDING_MAX_AGE_MS = 2 * 60 * 1000;

export type ReloadRecord = {
  at: string;
  reason: string;
  path: string;
};

export type PageLoadRecord = {
  at: string;
  path: string;
  /** navigate | reload | back_forward | prerender */
  navigation: string;
  /** Set when the app (or the boot guard in index.html) started the reload. */
  appReason?: string;
  appReasonAt?: string;
  /** Chrome discarded the hidden tab to save memory and reloaded it on return. */
  discarded?: boolean;
};

function currentPath(): string {
  try {
    return `${window.location.pathname}${window.location.search}`;
  } catch {
    return "";
  }
}

/** Call right before an automatic window.location.reload()/replace(). */
export function noteReloadReason(reason: string): void {
  try {
    const record: ReloadRecord = {
      at: new Date().toISOString(),
      reason,
      path: currentPath(),
    };
    localStorage.setItem(PENDING_KEY, JSON.stringify(record));
  } catch {
    // storage blocked — the reload still goes ahead
  }
}

function navigationType(): string {
  try {
    const entry = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    if (entry?.type) return entry.type;
  } catch {
    // ignore
  }
  return "unknown";
}

function readHistory(): PageLoadRecord[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function getReloadHistory(): PageLoadRecord[] {
  return readHistory();
}

let recorded = false;

/** Once per page load, at startup. */
export function recordPageLoad(): void {
  if (recorded || typeof window === "undefined") return;
  recorded = true;

  const load: PageLoadRecord = {
    at: new Date().toISOString(),
    path: currentPath(),
    navigation: navigationType(),
  };

  try {
    const raw = localStorage.getItem(PENDING_KEY);
    if (raw) {
      localStorage.removeItem(PENDING_KEY);
      const pending = JSON.parse(raw) as ReloadRecord;
      const age = Date.now() - Date.parse(pending.at);
      if (Number.isFinite(age) && age >= 0 && age <= PENDING_MAX_AGE_MS) {
        load.appReason = pending.reason;
        load.appReasonAt = pending.at;
      }
    }
  } catch {
    // ignore
  }

  if ((document as Document & { wasDiscarded?: boolean }).wasDiscarded) {
    load.discarded = true;
  }

  try {
    const history = readHistory();
    history.push(load);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-HISTORY_MAX)));
  } catch {
    // ignore
  }

  // One line, only on the load right after an automatic reload or a tab discard.
  if (load.appReason) {
    console.warn(
      `[reload] The app reloaded itself at ${load.appReasonAt}: ${load.appReason} (page ${load.path}). History: window.__ezzyReloads.print()`,
    );
  } else if (load.discarded) {
    console.warn(
      "[reload] Chrome discarded this tab while it was in the background (Memory Saver / low memory) and reloaded it. History: window.__ezzyReloads.print()",
    );
  }

  (window as Window & { __ezzyReloads?: unknown }).__ezzyReloads = {
    history: getReloadHistory,
    print: () => {
      console.table(getReloadHistory());
    },
  };
}
