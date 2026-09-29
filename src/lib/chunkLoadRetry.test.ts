import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  CRITICAL_ENTRY_CHUNK_PATHS,
  ELECTRON_CRITICAL_ENTRY_CHUNK_PATHS,
  criticalEntryChunkPathsForShell,
  isChunkLoadError,
  chunkUrlFromError,
  isChunkGoneFromServer,
  canAttemptSkewRecoveryReload,
  resetSkewReloadCount,
  SKEW_RELOAD_COOLDOWN_MS,
  POST_LOGIN_PREFETCH_TAB_PATHS_WEB,
  POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS,
  POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS,
  POST_LOGIN_WEB_IDLE_PRIORITY_DELAY_MS,
  POST_LOGIN_WEB_IDLE_PRIORITY_PREFETCH_TAB_PATHS,
  ACCOUNTS_TAB_PREFETCH_PATHS,
  POS_CONTEXT_PURCHASE_PREFETCH_PATHS,
  POS_CONTEXT_WARM_TAB_PATH,
} from "./chunkLoadRetry";
import { LONG_BUDGET_OUTLET_ENTRY_PATHS } from "./tabCacheReadiness";

describe("isChunkLoadError", () => {
  it("matches real dynamic-import / chunk failures", () => {
    expect(
      isChunkLoadError(new Error("Failed to fetch dynamically imported module: /assets/POSSales.js")),
    ).toBe(true);
    expect(isChunkLoadError(new Error("Loading chunk 42 failed"))).toBe(true);
    expect(isChunkLoadError(new Error("Unexpected token '<'"))).toBe(true);
    expect(isChunkLoadError(new Error("Module load timed out"))).toBe(true);
    expect(
      isChunkLoadError(new Error("error loading dynamically imported module")),
    ).toBe(true);
    expect(
      isChunkLoadError(new Error("Importing a module script failed.")),
    ).toBe(true);
    expect(isChunkLoadError(new Error("Loading CSS chunk 12 failed"))).toBe(true);
    const named = new Error("boom");
    named.name = "ChunkLoadError";
    expect(isChunkLoadError(named)).toBe(true);
  });

  it("still classifies post-deploy HTML-for-JS skew (for one bounded reload)", () => {
    // CDN/index.html served for a renamed hashed chunk often surfaces as parse errors.
    expect(isChunkLoadError(new Error("Unexpected token '<'"))).toBe(true);
    expect(
      isChunkLoadError(
        new Error("Failed to fetch dynamically imported module: https://app.example/assets/Index-oldhash.js"),
      ),
    ).toBe(true);
    // Browser console (Albeli / Windows PWA): MIME text/html for pdf-vendor / Profile chunks.
    expect(
      isChunkLoadError(
        new Error(
          'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
        ),
      ),
    ).toBe(true);
    expect(
      isChunkLoadError(
        'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
      ),
    ).toBe(true);
  });

  it("does not treat JSON parse of an HTML error page as chunk skew (no full reload)", () => {
    // Chrome/Edge: API or gateway (502/504) returned an HTML page and JSON.parse failed.
    expect(
      isChunkLoadError(
        new SyntaxError(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`),
      ),
    ).toBe(false);
    expect(
      isChunkLoadError(
        new SyntaxError(`Unexpected token '<', "<html>\n<h"... is not valid JSON`),
      ),
    ).toBe(false);
    // supabase-js fetch-failure wrapper re-thrown as Error(error.message).
    expect(
      isChunkLoadError(
        new Error(`SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`),
      ),
    ).toBe(false);
    // Plain string form (window "error" event message).
    expect(
      isChunkLoadError(`Uncaught SyntaxError: Unexpected token '<', "<!DOCTYPE "... is not valid JSON`),
    ).toBe(false);
    // Real HTML-for-JS chunk skew still recovers.
    expect(isChunkLoadError(new SyntaxError("Unexpected token '<'"))).toBe(true);
    expect(isChunkLoadError("Uncaught SyntaxError: Unexpected token '<'")).toBe(true);
  });

  it("does not treat app ReferenceErrors as chunk skew (no Updating… reload)", () => {
    expect(isChunkLoadError(new Error("maxFlatDiscountForGross is not defined"))).toBe(false);
    expect(isChunkLoadError(new ReferenceError("foo is not defined"))).toBe(false);
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined"))).toBe(false);
  });
});

describe("skew recovery cooldown", () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    store.clear();
  });

  it("allows the first attempt", () => {
    expect(canAttemptSkewRecoveryReload(1_000_000)).toBe(true);
  });

  it("blocks a second attempt after chunk_recovery_reloaded flag", () => {
    sessionStorage.setItem("chunk_recovery_reloaded", "1");
    expect(canAttemptSkewRecoveryReload()).toBe(false);
  });

  it("blocks a second attempt for the rest of the tab session", () => {
    const t0 = 1_000_000;
    sessionStorage.setItem("skew_reload_at", String(t0));
    expect(canAttemptSkewRecoveryReload(t0 + 30_000)).toBe(false);
    expect(canAttemptSkewRecoveryReload(t0 + SKEW_RELOAD_COOLDOWN_MS)).toBe(false);
    expect(canAttemptSkewRecoveryReload(t0 + 24 * 60 * 60 * 1000)).toBe(false);
  });

  it("resetSkewReloadCount clears the cooldown", () => {
    sessionStorage.setItem("skew_reload_at", String(Date.now()));
    resetSkewReloadCount();
    expect(canAttemptSkewRecoveryReload()).toBe(true);
  });

  it("blocks a second reload from the same build (loop guard)", () => {
    sessionStorage.setItem("skew_reload_build", "build-A");
    sessionStorage.setItem("chunk_recovery_reloaded", "1");
    expect(canAttemptSkewRecoveryReload(Date.now(), "build-A")).toBe(false);
  });

  it("allows one more reload after the tab moved to a newer build and that build went stale", () => {
    // Morning: build A recovered onto build B. Afternoon deploy C: build B's chunks 404.
    sessionStorage.setItem("skew_reload_build", "build-A");
    sessionStorage.setItem("chunk_recovery_reloaded", "1");
    sessionStorage.setItem("skew_reload_at", String(Date.now()));
    expect(canAttemptSkewRecoveryReload(Date.now(), "build-B")).toBe(true);
  });

  it("keeps legacy flags (no build key) blocking for the rest of that session", () => {
    sessionStorage.setItem("chunk_recovery_reloaded", "1");
    expect(canAttemptSkewRecoveryReload(Date.now(), "build-B")).toBe(false);
  });
});

describe("idle / wake entry-chunk prefetch lists", () => {
  it("keeps post-login critical warm to dashboard + POS only", () => {
    expect([...POST_LOGIN_PREFETCH_TAB_PATHS_WEB]).toEqual(["", "pos-sales"]);
    expect(POST_LOGIN_PREFETCH_TAB_PATHS_WEB).not.toContain("purchase-bills");
    expect(POST_LOGIN_PREFETCH_TAB_PATHS_WEB).not.toContain("settings");
  });

  it("warms purchase-entry and product-entry on web idle after login", () => {
    expect(POST_LOGIN_WEB_IDLE_PRIORITY_PREFETCH_TAB_PATHS).toEqual([
      "purchase-entry",
      "sales-invoice",
      "products",
    ]);
    expect(POST_LOGIN_WEB_IDLE_PRIORITY_DELAY_MS).toBe(500);
    expect(POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS[0]).not.toBe("purchase-entry");
    expect(POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS).toEqual(
      expect.arrayContaining(["product-entry", "purchase-bills"]),
    );
  });

  it("warms settings and other cold admin routes on web idle (not parallel critical)", () => {
    expect(POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS).toEqual(
      expect.arrayContaining([
        "settings",
        "user-rights",
        "accounts",
        "accounts-payments",
        "customer-account-statement",
        "customer-party-balances",
        "barcode-printing",
        "third-party-entry",
        "third-party-balances",
      ]),
    );
    // Must not be in the slim parallel critical set (contention).
    expect(POST_LOGIN_PREFETCH_TAB_PATHS_WEB).not.toContain("settings");
  });

  it("lists accounts/payments/ledger paths for mutual tab warm", () => {
    expect(ACCOUNTS_TAB_PREFETCH_PATHS).toEqual(
      expect.arrayContaining([
        "accounts",
        "accounts-payments",
        "customer-account-statement",
      ]),
    );
  });

  it("re-warms critical bill-entry chunks after tab becomes visible", () => {
    expect(CRITICAL_ENTRY_CHUNK_PATHS).toEqual([
      "purchase-entry",
      "product-entry",
      "pos-sales",
      "pos-delivery-challan",
      "sales-invoice",
      "sale-return-entry",
      "quotation-entry",
      "sale-order-entry",
      "purchase-return-entry",
    ]);
  });

  it("keeps Electron wake/hover on the original slim set", () => {
    expect(ELECTRON_CRITICAL_ENTRY_CHUNK_PATHS).toEqual([
      "purchase-entry",
      "product-entry",
      "pos-sales",
      "pos-delivery-challan",
      "sales-invoice",
    ]);
    expect(criticalEntryChunkPathsForShell(true)).toEqual(ELECTRON_CRITICAL_ENTRY_CHUNK_PATHS);
    expect(criticalEntryChunkPathsForShell(false)).toEqual(CRITICAL_ENTRY_CHUNK_PATHS);
    expect(criticalEntryChunkPathsForShell(true)).not.toContain("sale-return-entry");
    expect(criticalEntryChunkPathsForShell(true)).not.toContain("quotation-entry");
    expect(criticalEntryChunkPathsForShell(true)).not.toContain("sale-order-entry");
    expect(criticalEntryChunkPathsForShell(true)).not.toContain("purchase-return-entry");
  });

  it("does not grow the parallel post-login warm list", () => {
    expect(POST_LOGIN_PREFETCH_TAB_PATHS_WEB).toEqual(["", "pos-sales"]);
  });

  it("covers every long-budget Outlet entry (rescue + eager prefetch)", () => {
    for (const path of LONG_BUDGET_OUTLET_ENTRY_PATHS) {
      expect(CRITICAL_ENTRY_CHUNK_PATHS, path).toContain(path);
    }
  });

  it("declares POS-context warm for purchase-entry (outlet POS routes)", () => {
    expect(POS_CONTEXT_PURCHASE_PREFETCH_PATHS).toEqual(
      expect.arrayContaining(["pos-sales", "pos-delivery-challan"]),
    );
    expect(POS_CONTEXT_WARM_TAB_PATH).toBe("purchase-entry");
    expect(POST_LOGIN_PREFETCH_TAB_PATHS_WEB).not.toContain("purchase-entry");
  });
});

describe("deploy-skew fast path", () => {
  const ORIGIN = "https://app.example";

  it("reads the chunk URL from Chrome's failed dynamic import message", () => {
    expect(
      chunkUrlFromError(
        new Error("Failed to fetch dynamically imported module: https://app.example/assets/POSSales-abc123.js"),
        ORIGIN,
      ),
    ).toBe("https://app.example/assets/POSSales-abc123.js");
    expect(
      chunkUrlFromError(new Error("Failed to fetch dynamically imported module: /assets/POSSales.js"), ORIGIN),
    ).toBe("https://app.example/assets/POSSales.js");
  });

  it("returns null when there is no app chunk URL to check", () => {
    // Safari gives no URL; other hosts and non-asset paths are not ours to judge.
    expect(chunkUrlFromError(new Error("Importing a module script failed."), ORIGIN)).toBeNull();
    expect(
      chunkUrlFromError(new Error("Failed to fetch dynamically imported module: https://cdn.other/assets/x.js"), ORIGIN),
    ).toBeNull();
    expect(chunkUrlFromError(new Error("Module load timed out"), ORIGIN)).toBeNull();
  });

  function fakeFetch(status: number, contentType = "application/javascript") {
    return vi.fn(async () => ({
      status,
      ok: status >= 200 && status < 300,
      headers: { get: () => contentType },
    })) as unknown as typeof fetch;
  }

  it("treats 404 / 410 / HTML-for-JS as a chunk that is gone", async () => {
    await expect(isChunkGoneFromServer("https://app.example/assets/a.js", fakeFetch(404))).resolves.toBe(true);
    await expect(isChunkGoneFromServer("https://app.example/assets/a.js", fakeFetch(410))).resolves.toBe(true);
    await expect(
      isChunkGoneFromServer("https://app.example/assets/a.js", fakeFetch(200, "text/html; charset=utf-8")),
    ).resolves.toBe(true);
  });

  it("keeps normal retries when the chunk exists or the network is flaky", async () => {
    await expect(isChunkGoneFromServer("https://app.example/assets/a.js", fakeFetch(200))).resolves.toBe(false);
    await expect(isChunkGoneFromServer("https://app.example/assets/a.js", fakeFetch(503))).resolves.toBe(false);
    const offline = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    await expect(isChunkGoneFromServer("https://app.example/assets/a.js", offline)).resolves.toBe(false);
  });

  it("asks the server with HEAD and no HTTP cache", async () => {
    const f = fakeFetch(404);
    await isChunkGoneFromServer("https://app.example/assets/a.js", f);
    expect(f).toHaveBeenCalledWith(
      "https://app.example/assets/a.js",
      expect.objectContaining({ method: "HEAD", cache: "no-store" }),
    );
  });

  it("gives up after the timeout instead of holding the retries", async () => {
    const hang = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
        }),
    ) as unknown as typeof fetch;
    await expect(isChunkGoneFromServer("https://app.example/assets/a.js", hang, 10)).resolves.toBe(false);
  });
});
