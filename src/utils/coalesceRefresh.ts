/**
 * Run a screen refresh at most once per short window (review items L1, L2, L5).
 *
 * One saved bill used to ask for the same refresh five or more times within two seconds: the
 * save itself, the page that saved it, a window event, and two live listeners on the sales
 * table. Each request restarted the fetch that was already running, so the dashboards and the
 * whole-shop customer / sales lists were loaded again and again, and the counter felt sticky
 * for a moment after every bill.
 *
 * coalesceRefresh(owner, key, run):
 *   - the first request runs at once (a screen opened right after still gets fresh data);
 *   - further requests inside the window are merged into ONE run at the end of the window,
 *     so the last change is always picked up.
 *
 * `owner` is the QueryClient: state is kept per client, so tests (a new client each) and
 * separate app instances never share a window.
 */
export const REFRESH_COALESCE_MS = 2500;

type Entry = { lastRun: number; timer: ReturnType<typeof setTimeout> | null; pending: (() => void) | null };

const windows = new WeakMap<object, Map<string, Entry>>();

function entryFor(owner: object, key: string): Entry {
  let byKey = windows.get(owner);
  if (!byKey) {
    byKey = new Map();
    windows.set(owner, byKey);
  }
  let entry = byKey.get(key);
  if (!entry) {
    entry = { lastRun: Number.NEGATIVE_INFINITY, timer: null, pending: null };
    byKey.set(key, entry);
  }
  return entry;
}

export function coalesceRefresh(
  owner: object,
  key: string,
  run: () => void,
  opts: { gapMs?: number; /** false = drop repeats inside the window instead of running once more at its end. */ trailing?: boolean } = {},
): void {
  const gapMs = opts.gapMs ?? REFRESH_COALESCE_MS;
  const entry = entryFor(owner, key);
  const now = Date.now();
  if (!entry.timer && now - entry.lastRun >= gapMs) {
    entry.lastRun = now;
    run();
    return;
  }
  if (opts.trailing === false) return;
  // The latest request wins: it knows the newest state (e.g. the strongest refetch asked for).
  entry.pending = run;
  if (entry.timer) return;
  entry.timer = setTimeout(() => {
    entry.timer = null;
    entry.lastRun = Date.now();
    const fn = entry.pending;
    entry.pending = null;
    fn?.();
  }, Math.max(0, entry.lastRun + gapMs - now));
}
