import { describe, expect, it } from "vitest";
import {
  CRITICAL_ENTRY_CHUNK_PATHS,
  isChunkLoadError,
  POST_LOGIN_PREFETCH_TAB_PATHS_WEB,
  POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS,
  POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS,
} from "./chunkLoadRetry";

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

describe("idle / wake entry-chunk prefetch lists", () => {
  it("warms purchase-entry and product-entry on web idle after login", () => {
    expect(POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS).toEqual(
      expect.arrayContaining(["purchase-entry", "product-entry"]),
    );
  });

  it("warms settings and other cold admin routes on web idle (not parallel critical)", () => {
    expect(POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS).toEqual(
      expect.arrayContaining([
        "settings",
        "user-rights",
        "accounts",
        "barcode-printing",
        "third-party-entry",
        "third-party-balances",
      ]),
    );
    // Must not be in the slim parallel critical set (contention).
    expect(POST_LOGIN_PREFETCH_TAB_PATHS_WEB).not.toContain("settings");
  });

  it("re-warms critical bill-entry chunks after tab becomes visible", () => {
    expect(CRITICAL_ENTRY_CHUNK_PATHS).toEqual(
      expect.arrayContaining([
        "purchase-entry",
        "product-entry",
        "pos-sales",
        "sales-invoice",
      ]),
    );
  });
});
