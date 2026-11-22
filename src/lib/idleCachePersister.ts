import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

/**
 * Saves the React Query cache to disk without freezing the screen (speed review item S1).
 *
 * Before: the whole cache was turned into one JSON text and written as often as every
 * 2 seconds, in the middle of whatever the cashier was doing. The text holds every list the
 * shop opened that day (all customers, product catalogue), so the pause grew over the shift.
 *
 * Now:
 *  - only what changed is turned into text again: the JSON of each large query is kept and
 *    reused while its data is the same object with the same update time;
 *  - a write happens `intervalMs` after the first unsaved change (so at most once per
 *    interval), and then waits for an idle moment;
 *  - when the page is hidden or closed, what is pending is written at once (best effort).
 */
export type CacheStorage = {
  getItem: (key: string) => Promise<string | undefined | null>;
  setItem: (key: string, value: string) => Promise<unknown>;
  removeItem: (key: string) => Promise<unknown>;
};

/** Data JSON shorter than this is cheap to rebuild and is not kept. */
export const KEEP_JSON_FROM_CHARS = 2048;

type KeptJson = { data: unknown; dataUpdatedAt: unknown; json: string };

/** `{"a":1}` + `"b"`, `2` → `{"a":1,"b":2}`. `valueJson` undefined (not JSON-able) leaves the object as is. */
function withProp(objectJson: string, name: string, valueJson: string | undefined): string {
  if (valueJson === undefined) return objectJson;
  const prop = `${JSON.stringify(name)}:${valueJson}`;
  return objectJson === "{}" ? `{${prop}}` : `${objectJson.slice(0, -1)},${prop}}`;
}

/**
 * JSON text of the persisted client; parses to the same value as `JSON.stringify(client)`.
 * `kept` carries the data JSON of large queries from one call to the next.
 */
export function serializePersistedClient(client: PersistedClient, kept: Map<string, KeptJson>): string {
  const { clientState, ...top } = client;
  const { queries, ...stateRest } = clientState ?? { queries: [], mutations: [] };
  const next = new Map<string, KeptJson>();

  const queryJsons = (queries ?? []).map((query) => {
    const { state, ...queryRest } = query;
    const { data, ...stateFields } = state;
    const hit = kept.get(query.queryHash);
    let dataJson: string | undefined;
    if (hit && hit.data === data && hit.dataUpdatedAt === state.dataUpdatedAt) {
      dataJson = hit.json;
      next.set(query.queryHash, hit);
    } else {
      dataJson = JSON.stringify(data);
      if (dataJson !== undefined && dataJson.length >= KEEP_JSON_FROM_CHARS) {
        next.set(query.queryHash, { data, dataUpdatedAt: state.dataUpdatedAt, json: dataJson });
      }
    }
    const stateJson = withProp(JSON.stringify(stateFields), "data", dataJson);
    return withProp(JSON.stringify(queryRest), "state", stateJson);
  });

  // Queries that left the cache drop their kept JSON too.
  kept.clear();
  for (const [hash, entry] of next) kept.set(hash, entry);

  const clientStateJson = withProp(JSON.stringify(stateRest), "queries", `[${queryJsons.join(",")}]`);
  return withProp(JSON.stringify(top), "clientState", clientStateJson);
}

type IdleDeadlineLike = { timeRemaining: () => number; didTimeout: boolean };
type Scheduler = {
  now: () => number;
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
  /** Run when the browser is idle, or after `timeoutMs` at the latest. */
  whenIdle: (run: () => void, timeoutMs: number) => void;
  /** Call `flush` when the page is hidden or closed. */
  onPageHide: (flush: () => void) => void;
};

function browserScheduler(): Scheduler {
  const w = typeof window !== "undefined" ? window : undefined;
  const idle = (w as { requestIdleCallback?: (cb: (d: IdleDeadlineLike) => void, o: { timeout: number }) => number } | undefined)
    ?.requestIdleCallback;
  return {
    now: () => Date.now(),
    setTimeout: (run, ms) => setTimeout(run, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    whenIdle: (run, timeoutMs) => {
      if (idle && w) idle.call(w, () => run(), { timeout: timeoutMs });
      else setTimeout(run, 0);
    },
    onPageHide: (flush) => {
      if (!w || typeof document === "undefined") return;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flush();
      });
      w.addEventListener("pagehide", flush);
    },
  };
}

export function createIdleCachePersister(options: {
  storage: CacheStorage;
  key: string;
  /** Wait after the first unsaved change; also the least time between two writes. */
  intervalMs?: number;
  /** Longest a due write waits for an idle moment. */
  idleTimeoutMs?: number;
  scheduler?: Scheduler;
}): Persister {
  const { storage, key, intervalMs = 5000, idleTimeoutMs = 1500 } = options;
  const scheduler = options.scheduler ?? browserScheduler();
  const kept = new Map<string, KeptJson>();
  let pending: PersistedClient | null = null;
  /** The write that is waiting (for its time, then for an idle moment); null when none is. */
  let scheduled: { handle: unknown } | null = null;
  /** Bumped by removeClient, so a write already under way does not bring the cache back. */
  let generation = 0;

  const write = () => {
    const client = pending;
    pending = null;
    if (!client) return;
    const mine = generation;
    let text: string;
    try {
      text = serializePersistedClient(client, kept);
    } catch {
      return; // not JSON-able (a cycle): skip this round, as the old persister did
    }
    if (mine !== generation) return;
    void storage.setItem(key, text).catch(() => undefined);
  };

  const cancelScheduled = () => {
    if (!scheduled) return;
    scheduler.clearTimeout(scheduled.handle);
    scheduled = null;
  };

  const flushNow = () => {
    cancelScheduled();
    write();
  };

  scheduler.onPageHide(flushNow);

  return {
    persistClient: (client) => {
      pending = client;
      if (scheduled) return;
      // Always one interval after the first unsaved change: a bill save changes dozens of
      // queries over a second or two, and they go to disk together.
      const wait = intervalMs;
      const mine: { handle: unknown } = { handle: null };
      scheduled = mine;
      mine.handle = scheduler.setTimeout(() => {
        scheduler.whenIdle(() => {
          // Flushed or removed meanwhile: that already wrote (or dropped) what was pending.
          if (scheduled !== mine) return;
          scheduled = null;
          write();
        }, idleTimeoutMs);
      }, wait);
    },
    restoreClient: async () => {
      const text = await storage.getItem(key);
      if (!text) return undefined;
      return JSON.parse(text) as PersistedClient;
    },
    removeClient: async () => {
      generation += 1;
      pending = null;
      kept.clear();
      cancelScheduled();
      await storage.removeItem(key);
    },
  };
}
