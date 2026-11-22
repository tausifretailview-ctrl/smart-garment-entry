import { dehydrate, QueryClient } from "@tanstack/react-query";
import type { PersistedClient } from "@tanstack/react-query-persist-client";
import { describe, expect, it, vi } from "vitest";
import { createIdleCachePersister, KEEP_JSON_FROM_CHARS, serializePersistedClient } from "./idleCachePersister";

/**
 * The saved-data cache used to be turned into one JSON text and written as often as every
 * 2 seconds (speed review item S1). It is now written rarely, in an idle moment, and only the
 * changed queries are serialised again.
 */
const bigRows = (n: number, tag = "row") => Array.from({ length: n }, (_, i) => ({ id: i, name: `${tag} ${i}`, price: i * 1.5 }));

function clientWith(entries: Array<[unknown[], unknown]>): { client: QueryClient; persisted: () => PersistedClient } {
  const client = new QueryClient();
  for (const [key, data] of entries) client.setQueryData(key, data);
  return { client, persisted: () => ({ buster: "b1", timestamp: 123, clientState: dehydrate(client) }) };
}

describe("serializePersistedClient", () => {
  it("gives the same value as JSON.stringify for a real dehydrated cache", () => {
    const { persisted } = clientWith([
      [["customers", "org"], bigRows(300)],
      [["settings", "org"], { gst: true, name: 'A "quoted" shop', nested: { list: [1, null, "x"] } }],
      [["count"], 0],
      [["nothing"], null],
      [["text"], "plain"],
    ]);
    const p = persisted();
    expect(JSON.parse(serializePersistedClient(p, new Map()))).toEqual(JSON.parse(JSON.stringify(p)));
  });

  it("handles an empty cache and a client without queries", () => {
    const empty: PersistedClient = { buster: "", timestamp: 1, clientState: { mutations: [], queries: [] } };
    expect(JSON.parse(serializePersistedClient(empty, new Map()))).toEqual(empty);
  });

  it("serialises a large unchanged query once and reuses its text", () => {
    const rows = bigRows(500);
    const { client, persisted } = clientWith([[["catalogue"], rows], [["small"], { a: 1 }]]);
    const kept = new Map();
    const stringify = vi.spyOn(JSON, "stringify");
    try {
      serializePersistedClient(persisted(), kept);
      const firstRowsCalls = stringify.mock.calls.filter(([v]) => v === rows).length;
      expect(firstRowsCalls).toBe(1);
      expect(kept.has(client.getQueryCache().find({ queryKey: ["catalogue"] })!.queryHash)).toBe(true);
      // Small data is rebuilt each time; it is not worth keeping.
      expect(kept.size).toBe(1);

      stringify.mockClear();
      client.setQueryData(["small"], { a: 2 });
      const again = persisted();
      const second = serializePersistedClient(again, kept);
      expect(stringify.mock.calls.filter(([v]) => v === rows).length).toBe(0);
      expect(JSON.parse(second)).toEqual(JSON.parse(JSON.stringify(again)));
    } finally {
      stringify.mockRestore();
    }
  });

  it("serialises again when the data changed, or was set again as the same object", async () => {
    const rows = bigRows(500);
    const { client, persisted } = clientWith([[["catalogue"], rows]]);
    const kept = new Map();
    serializePersistedClient(persisted(), kept);

    client.setQueryData(["catalogue"], bigRows(500, "new"));
    expect(JSON.parse(serializePersistedClient(persisted(), kept)).clientState.queries[0].state.data[0].name).toBe("new 0");

    // Same array object, changed in place and set again: the update time differs, so no reuse.
    const current = client.getQueryData<Array<{ name: string }>>(["catalogue"])!;
    current[0].name = "edited in place";
    await new Promise((r) => setTimeout(r, 2));
    client.setQueryData(["catalogue"], current, { updatedAt: Date.now() + 5 });
    expect(JSON.parse(serializePersistedClient(persisted(), kept)).clientState.queries[0].state.data[0].name).toBe("edited in place");
  });

  it("forgets the text of queries that left the cache", () => {
    const { client, persisted } = clientWith([[["a"], bigRows(400)], [["b"], bigRows(400)]]);
    const kept = new Map();
    serializePersistedClient(persisted(), kept);
    expect(kept.size).toBe(2);
    client.removeQueries({ queryKey: ["a"] });
    serializePersistedClient(persisted(), kept);
    expect(kept.size).toBe(1);
  });

  it("keeps the threshold meaningful", () => {
    expect(JSON.stringify(bigRows(300)).length).toBeGreaterThan(KEEP_JSON_FROM_CHARS);
  });
});

/** A hand-driven clock, idle queue and page-hide hook. */
function fakeScheduler() {
  let now = 1_000_000;
  const timers: Array<{ at: number; run: () => void; handle: number; cancelled: boolean }> = [];
  const idle: Array<() => void> = [];
  let hide: (() => void) | null = null;
  let seq = 0;
  return {
    scheduler: {
      now: () => now,
      setTimeout: (run: () => void, ms: number) => {
        const t = { at: now + ms, run, handle: ++seq, cancelled: false };
        timers.push(t);
        return t.handle;
      },
      clearTimeout: (handle: unknown) => {
        const t = timers.find((x) => x.handle === handle);
        if (t) t.cancelled = true;
      },
      whenIdle: (run: () => void) => {
        idle.push(run);
      },
      onPageHide: (flush: () => void) => {
        hide = flush;
      },
    },
    advance: (ms: number) => {
      now += ms;
      for (const t of timers.filter((x) => !x.cancelled && x.at <= now)) {
        t.cancelled = true;
        t.run();
      }
    },
    runIdle: () => {
      while (idle.length) idle.shift()!();
    },
    hidePage: () => hide?.(),
  };
}

function memoryStorage() {
  const data = new Map<string, string>();
  const writes: string[] = [];
  return {
    data,
    writes,
    storage: {
      getItem: async (key: string) => data.get(key),
      setItem: async (key: string, value: string) => {
        writes.push(value);
        data.set(key, value);
      },
      removeItem: async (key: string) => {
        data.delete(key);
      },
    },
  };
}

const persistedOf = (n: number): PersistedClient => ({
  buster: "b",
  timestamp: n,
  clientState: { mutations: [], queries: [] },
});

describe("createIdleCachePersister", () => {
  it("writes once per interval, the latest state, and only when idle", async () => {
    const s = fakeScheduler();
    const m = memoryStorage();
    const persister = createIdleCachePersister({ storage: m.storage, key: "K", intervalMs: 5000, scheduler: s.scheduler });

    // A burst of cache changes (one bill save touches dozens of queries).
    for (let i = 1; i <= 40; i++) void persister.persistClient(persistedOf(i));
    expect(m.writes).toHaveLength(0);

    s.advance(4999);
    s.runIdle();
    expect(m.writes).toHaveLength(0);

    s.advance(1); // due, but the screen is busy: waits for the idle moment
    expect(m.writes).toHaveLength(0);
    s.runIdle();
    expect(m.writes).toHaveLength(1);
    expect(JSON.parse(m.writes[0]).timestamp).toBe(40);

    // Nothing new: nothing written.
    s.advance(60_000);
    s.runIdle();
    expect(m.writes).toHaveLength(1);

    // The next change again waits a full interval, so what follows it is saved with it.
    void persister.persistClient(persistedOf(41));
    s.advance(4999);
    s.runIdle();
    expect(m.writes).toHaveLength(1);
    s.advance(1);
    s.runIdle();
    expect(m.writes).toHaveLength(2);
    expect(await persister.restoreClient()).toEqual(persistedOf(41));
  });

  it("writes at once when the page is hidden or closed, and not a second time later", () => {
    const s = fakeScheduler();
    const m = memoryStorage();
    const persister = createIdleCachePersister({ storage: m.storage, key: "K", intervalMs: 5000, scheduler: s.scheduler });
    void persister.persistClient(persistedOf(7));
    s.hidePage();
    expect(m.writes).toHaveLength(1);
    expect(JSON.parse(m.writes[0]).timestamp).toBe(7);
    s.advance(10_000);
    s.runIdle();
    expect(m.writes).toHaveLength(1);
    // Hidden with nothing pending: no write.
    s.hidePage();
    expect(m.writes).toHaveLength(1);
  });

  it("hidden while a due write waits for idle: written once", () => {
    const s = fakeScheduler();
    const m = memoryStorage();
    const persister = createIdleCachePersister({ storage: m.storage, key: "K", intervalMs: 5000, scheduler: s.scheduler });
    void persister.persistClient(persistedOf(1));
    s.advance(5000); // due, waiting for idle
    s.hidePage();
    expect(m.writes).toHaveLength(1);
    void persister.persistClient(persistedOf(2)); // a new change schedules its own write
    s.runIdle(); // the old idle callback must not write the new change early
    expect(m.writes).toHaveLength(1);
    s.advance(5000);
    s.runIdle();
    expect(m.writes).toHaveLength(2);
  });

  it("removeClient drops what was pending and clears the disk copy", async () => {
    const s = fakeScheduler();
    const m = memoryStorage();
    const persister = createIdleCachePersister({ storage: m.storage, key: "K", intervalMs: 5000, scheduler: s.scheduler });
    m.data.set("K", JSON.stringify(persistedOf(1)));
    void persister.persistClient(persistedOf(2));
    await persister.removeClient();
    s.advance(10_000);
    s.runIdle();
    expect(m.writes).toHaveLength(0);
    expect(await persister.restoreClient()).toBeUndefined();
  });

  it("a cache that cannot be turned into JSON is skipped, and later writes still work", () => {
    const s = fakeScheduler();
    const m = memoryStorage();
    const persister = createIdleCachePersister({ storage: m.storage, key: "K", intervalMs: 5000, scheduler: s.scheduler });
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    void persister.persistClient({ ...persistedOf(1), clientState: { mutations: [], queries: [{ queryHash: "h", queryKey: ["h"], state: { data: loop } } as never] } });
    s.advance(5000);
    expect(() => s.runIdle()).not.toThrow();
    expect(m.writes).toHaveLength(0);
    void persister.persistClient(persistedOf(2));
    s.advance(5000);
    s.runIdle();
    expect(m.writes).toHaveLength(1);
  });
});
