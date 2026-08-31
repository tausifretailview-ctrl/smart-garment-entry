import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  CRITICAL_ENTRY_CHUNK_PATHS,
  ELECTRON_CRITICAL_ENTRY_CHUNK_PATHS,
  criticalEntryChunkPathsForShell,
  isChunkLoadError,
  canAttemptSkewRecoveryReload,
  resetSkewReloadCount,
  SKEW_RELOAD_COOLDOWN_MS,
  POST_LOGIN_PREFETCH_TAB_PATHS_WEB,
  POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS,
  POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS,
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
});

describe("idle / wake entry-chunk prefetch lists", () => {
  it("keeps post-login critical warm to dashboard + POS only", () => {
    expect([...POST_LOGIN_PREFETCH_TAB_PATHS_WEB]).toEqual(["", "pos-sales"]);
    expect(POST_LOGIN_PREFETCH_TAB_PATHS_WEB).not.toContain("purchase-bills");
    expect(POST_LOGIN_PREFETCH_TAB_PATHS_WEB).not.toContain("settings");
  });

  it("warms purchase-entry and product-entry on web idle after login", () => {
    expect(POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS).toEqual(
      expect.arrayContaining(["purchase-entry", "product-entry", "purchase-bills"]),
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
