import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TAB_PAGE_REGISTRY,
  MASTER_TAB_PREFETCH_PATHS,
  INVENTORY_TAB_PREFETCH_PATHS,
  SALES_TAB_PREFETCH_PATHS,
  POST_LOGIN_PREFETCH_TAB_PATHS_WEB,
  POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS,
  isTabPageChunkInFlight,
  isTabPageChunkLoaded,
  prefetchTabPage,
  resetTabPageChunk,
  resolveTabCachePath,
  shouldAllowSpeculativeChunkPrefetch,
} from "./tabPageRegistry";
import { POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS } from "./chunkLoadRetry";

/** Mirrors TabCachedPages.resolveTabLoadShell — every registry route must map. */
function resolveTabLoadShell(path: string): "entry" | "dashboard" | "page" {
  const resolved = resolveTabCachePath(path);
  const def = TAB_PAGE_REGISTRY[resolved];
  if (resolved === "" || resolved === "dashboard") return "dashboard";
  if (!def) return "page";
  if (def.layout === "pos" || def.layout === "pos-dc") return "entry";
  if (
    resolved === "sales-invoice" ||
    (resolved.endsWith("-entry") &&
      resolved !== "third-party-entry" &&
      !resolved.startsWith("third-party"))
  ) {
    return "entry";
  }
  return "dashboard";
}

describe("resolveTabCachePath", () => {
  it("strips a leading slash so Header quickActions paths prefetch correctly", () => {
    expect(resolveTabCachePath("/purchase-entry")).toBe("purchase-entry");
    expect(resolveTabCachePath("purchase-entry")).toBe("purchase-entry");
    expect(resolveTabCachePath("/pos-sales")).toBe("pos-sales");
  });

  it("applies canonical aliases after slash strip", () => {
    expect(resolveTabCachePath("/purchase-bill-dashboard")).toBe("purchase-bills");
    expect(resolveTabCachePath("purchase-bill-dashboard")).toBe("purchase-bills");
  });
});

describe("tab load shell coverage", () => {
  it("maps every TAB_PAGE_REGISTRY key to entry or dashboard shell (no bare-spinner routes)", () => {
    const keys = Object.keys(TAB_PAGE_REGISTRY);
    expect(keys.length).toBeGreaterThan(20);
    for (const key of keys) {
      const shell = resolveTabLoadShell(key);
      expect(shell === "entry" || shell === "dashboard").toBe(true);
    }
  });

  it("classifies bill-entry screens as entry shell", () => {
    expect(resolveTabLoadShell("pos-sales")).toBe("entry");
    expect(resolveTabLoadShell("pos-delivery-challan")).toBe("entry");
    expect(resolveTabLoadShell("purchase-entry")).toBe("entry");
    expect(resolveTabLoadShell("product-entry")).toBe("entry");
    expect(resolveTabLoadShell("sales-invoice")).toBe("entry");
    expect(resolveTabLoadShell("sale-return-entry")).toBe("entry");
    expect(resolveTabLoadShell("quotation-entry")).toBe("entry");
    expect(resolveTabLoadShell("sale-order-entry")).toBe("entry");
    expect(resolveTabLoadShell("purchase-return-entry")).toBe("entry");
  });

  it("registers the four newly eager-prefetched entry pages", () => {
    for (const path of [
      "sale-return-entry",
      "quotation-entry",
      "sale-order-entry",
      "purchase-return-entry",
    ]) {
      expect(TAB_PAGE_REGISTRY[path], path).toBeDefined();
    }
  });

  it("maps settings, user-rights, and third-party routes to dashboard shell", () => {
    expect(resolveTabLoadShell("settings")).toBe("dashboard");
    expect(resolveTabLoadShell("user-rights")).toBe("dashboard");
    expect(resolveTabLoadShell("third-party-entry")).toBe("dashboard");
    expect(resolveTabLoadShell("third-party-balances")).toBe("dashboard");
    expect(resolveTabLoadShell("accounts")).toBe("dashboard");
  });
});

describe("master / inventory / sales tab mutual prefetch", () => {
  it("warms Customers and Suppliers like Sales dashboards (idle + sibling set)", () => {
    expect(MASTER_TAB_PREFETCH_PATHS).toContain("customers");
    expect(MASTER_TAB_PREFETCH_PATHS).toContain("suppliers");
    expect(MASTER_TAB_PREFETCH_PATHS).toContain("salesman-commission");
    // Critical warm is dashboard + POS only — masters/dashboards idle-warm.
    expect(POST_LOGIN_PREFETCH_TAB_PATHS_WEB).toEqual(["", "pos-sales"]);
    expect(POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS).toContain("customers");
    expect(POST_LOGIN_WEB_IDLE_ADMIN_PREFETCH_TAB_PATHS).toContain("suppliers");
  });

  it("warms Inventory siblings including Product + Purchase dashboards", () => {
    expect(INVENTORY_TAB_PREFETCH_PATHS).toContain("products");
    expect(INVENTORY_TAB_PREFETCH_PATHS).toContain("purchase-bills");
    expect(INVENTORY_TAB_PREFETCH_PATHS).toContain("purchase-orders");
    expect(INVENTORY_TAB_PREFETCH_PATHS).toContain("stock-settlement");
    expect(POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS).toContain("products");
    expect(POST_LOGIN_WEB_IDLE_INVENTORY_PREFETCH_TAB_PATHS).toContain("purchase-bills");
  });

  it("keeps Sales POS ↔ Invoice mutual warm set", () => {
    expect(SALES_TAB_PREFETCH_PATHS).toContain("pos-dashboard");
    expect(SALES_TAB_PREFETCH_PATHS).toContain("sales-invoice-dashboard");
  });
});

describe("speculative vs intent prefetch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubWebNavigator(connection: { saveData?: boolean; effectiveType?: string }) {
    vi.stubGlobal("window", { electronAPI: undefined });
    vi.stubGlobal("navigator", { connection });
  }

  it("skips speculative prefetch on Save-Data", () => {
    stubWebNavigator({ saveData: true, effectiveType: "4g" });
    expect(shouldAllowSpeculativeChunkPrefetch()).toBe(false);
  });

  it("skips speculative prefetch on 2g", () => {
    stubWebNavigator({ saveData: false, effectiveType: "2g" });
    expect(shouldAllowSpeculativeChunkPrefetch()).toBe(false);
  });

  it("allows speculative prefetch on typical broadband", () => {
    stubWebNavigator({ saveData: false, effectiveType: "4g" });
    expect(shouldAllowSpeculativeChunkPrefetch()).toBe(true);
  });

  it("intent prefetch still runs when Save-Data would block speculative", () => {
    stubWebNavigator({ saveData: true, effectiveType: "2g" });
    expect(shouldAllowSpeculativeChunkPrefetch()).toBe(false);
    // Must not throw; silent catch on failure.
    expect(() => prefetchTabPage("user-rights", { intent: true })).not.toThrow();
    expect(() => prefetchTabPage("settings")).not.toThrow();
  });
});

describe("in-flight chunk bookkeeping (soft-retry must not remount)", () => {
  afterEach(() => {
    resetTabPageChunk("purchase-entry");
    resetTabPageChunk("purchase-bills");
  });

  it("isTabPageChunkInFlight is true while the import is still downloading", () => {
    const hanging = new Promise<{ default: () => null }>(() => {
      /* never resolve — Slow 3G cold chunk */
    });
    const original = TAB_PAGE_REGISTRY["purchase-entry"];
    TAB_PAGE_REGISTRY["purchase-entry"] = { ...original, loader: () => hanging };

    try {
      resetTabPageChunk("purchase-entry");
      expect(isTabPageChunkInFlight("purchase-entry")).toBe(false);
      expect(isTabPageChunkLoaded("purchase-entry")).toBe(false);

      prefetchTabPage("purchase-entry", { intent: true });
      // Soft-retry at 3s must see this and skip resetTabPageChunk / remount.
      expect(isTabPageChunkInFlight("purchase-entry")).toBe(true);
      expect(isTabPageChunkLoaded("purchase-entry")).toBe(false);
    } finally {
      TAB_PAGE_REGISTRY["purchase-entry"] = original;
      resetTabPageChunk("purchase-entry");
    }
  });

  it("purchase-bills alias shares the same in-flight key as the dashboard slug", () => {
    const hanging = new Promise<{ default: () => null }>(() => {
      /* never resolve */
    });
    const original = TAB_PAGE_REGISTRY["purchase-bills"];
    TAB_PAGE_REGISTRY["purchase-bills"] = { ...original, loader: () => hanging };
    TAB_PAGE_REGISTRY["purchase-bill-dashboard"] = TAB_PAGE_REGISTRY["purchase-bills"];

    try {
      resetTabPageChunk("purchase-bills");
      prefetchTabPage("purchase-bill-dashboard", { intent: true });
      expect(isTabPageChunkInFlight("purchase-bills")).toBe(true);
      expect(isTabPageChunkInFlight("purchase-bill-dashboard")).toBe(true);
    } finally {
      TAB_PAGE_REGISTRY["purchase-bills"] = original;
      TAB_PAGE_REGISTRY["purchase-bill-dashboard"] = original;
      resetTabPageChunk("purchase-bills");
    }
  });
});
