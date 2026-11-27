import { QueryObserver, type Query, type QueryClient } from "@tanstack/react-query";
import { queryHasQueryFn } from "@/utils/refetchQueriesWithFn";

/**
 * Screens kept open in background window tabs (TabCachedPages) stay mounted, so until now every
 * one of them reloaded its data and re-rendered each time a bill was saved (review items S2, L2).
 *
 * A hidden tab now does nothing until the user comes back to it:
 *  - its screens stop listening to the cache (IsRestoringProvider in HiddenTabQueryPause), so
 *    they neither re-render nor run their timers;
 *  - each query that only that tab was showing is "held": a disabled observer keeps the data in
 *    memory and makes React Query skip it in every refetch ("active" and "all");
 *  - the query is still marked out of date by invalidations, and is reloaded once, as soon as
 *    any screen shows it again.
 *
 * Queries that a visible screen also uses are not held and keep refreshing as before.
 */
type AnyQuery = Query<any, any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type AnyObserver = QueryObserver<any, any, any, any, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** The disabled observers this module attaches (never a screen's own observer). */
const holders = new WeakSet<object>();
/** Queries held at some point that may have missed a refresh; cleared when a screen shows them. */
const owed = new WeakSet<AnyQuery>();
/** Clients whose cache this module already listens to. */
const watched = new WeakSet<QueryClient>();

const isHolder = (observer: unknown): boolean => typeof observer === "object" && observer !== null && holders.has(observer);

/** True while only holders (or nothing) observe the query: no screen is listening to it. */
function hasNoScreenObserver(query: AnyQuery): boolean {
  return query.observers.every(isHolder);
}

/**
 * A held query that went out of date while its tab was hidden. It must not be written to disk:
 * after a reload a screen with `refetchOnMount: false` would show it without refreshing it.
 */
export function isOutdatedHeldQuery(query: object): boolean {
  return owed.has(query as AnyQuery) && (query as AnyQuery).state.isInvalidated;
}

/** Reload held queries that went out of date, once a screen is showing them again. */
function watchCache(client: QueryClient): void {
  if (watched.has(client)) return;
  watched.add(client);

  let pending: Set<AnyQuery> | null = null;
  const flush = () => {
    const batch = pending;
    pending = null;
    if (!batch) return;
    const reload = new Set<AnyQuery>();
    for (const query of batch) {
      if (!owed.has(query)) continue;
      // Still only held (or its screens are disabled): stays owed until one is live.
      if (!query.isActive()) continue;
      owed.delete(query);
      if (query.state.isInvalidated && queryHasQueryFn(query)) reload.add(query);
    }
    if (reload.size === 0) return;
    // cancelRefetch false: a screen that already started this reload on subscribe is not restarted.
    void client.refetchQueries({ predicate: (query) => reload.has(query as AnyQuery) }, { cancelRefetch: false });
  };

  client.getQueryCache().subscribe((event) => {
    if (event.type !== "observerAdded" && event.type !== "observerOptionsUpdated") return;
    if (!owed.has(event.query) || isHolder(event.observer)) return;
    if (!pending) {
      pending = new Set();
      queueMicrotask(flush);
    }
    pending.add(event.query);
  });
}

/**
 * Queries that went out of date while no screen showed them (a closed screen, or a hidden window
 * tab): reload each once, as soon as a screen shows it again. Screens with `refetchOnMount: false`
 * would otherwise open with the old data (liveStockRefresh.ts).
 */
export function reloadWhenShownAgain(client: QueryClient, queries: readonly Query[]): void {
  if (queries.length === 0) return;
  watchCache(client);
  for (const query of queries) owed.add(query as AnyQuery);
}

/** Queries some screen is showing right now. Take this just before a tab's screens let go. */
export function snapshotScreenQueries(client: QueryClient): AnyQuery[] {
  return client.getQueryCache().getAll().filter((query) => query.observers.length > 0 && !hasNoScreenObserver(query));
}

export type HeldQueries = {
  /** How many queries this hold froze. */
  readonly size: number;
  /** Let the queries go (the tab is shown again or closed). Safe to call twice. */
  release: () => void;
};

/**
 * Hold every query from `snapshot` that no screen shows any more (the tab that just went
 * hidden was the only one using it). Call after that tab's screens have let go.
 */
export function holdQueriesLeftByHiddenTab(client: QueryClient, snapshot: readonly AnyQuery[]): HeldQueries {
  watchCache(client);
  const cache = client.getQueryCache();
  const releases: Array<() => void> = [];

  for (const query of snapshot) {
    if (cache.get(query.queryHash) !== query) continue; // removed meanwhile
    if (!hasNoScreenObserver(query)) continue; // a visible screen still uses it
    // The query's own options (queryFn included) are kept; only `enabled` differs. A disabled
    // observer starts nothing, keeps the data from being garbage-collected, and makes
    // refetchQueries skip the query (Query.isDisabled).
    const holder: AnyObserver = new QueryObserver(client, {
      ...query.options,
      queryKey: query.queryKey,
      enabled: false,
      refetchInterval: false,
    });
    holders.add(holder);
    const unsubscribe = holder.subscribe(() => undefined);
    owed.add(query);
    releases.push(unsubscribe);
  }

  let released = false;
  return {
    size: releases.length,
    release: () => {
      if (released) return;
      released = true;
      for (const release of releases) release();
    },
  };
}
