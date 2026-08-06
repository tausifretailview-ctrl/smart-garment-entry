import { describe, expect, it } from "vitest";
import {
  bumpRecentTabPaneRetention,
  RECENT_TAB_PANE_RETENTION_MAX,
  RECENT_TAB_PANE_RETENTION_MS,
  RETAINABLE_TAB_CACHE_PATHS,
} from "./recentTabPaneRetention";
import {
  INVENTORY_TAB_PREFETCH_PATHS,
  MASTER_TAB_PREFETCH_PATHS,
} from "./chunkLoadRetry";

describe("recentTabPaneRetention", () => {
  it("derives retainable paths from master + inventory prefetch lists", () => {
    for (const p of MASTER_TAB_PREFETCH_PATHS) {
      expect(RETAINABLE_TAB_CACHE_PATHS.has(p)).toBe(true);
    }
    for (const p of INVENTORY_TAB_PREFETCH_PATHS) {
      expect(RETAINABLE_TAB_CACHE_PATHS.has(p)).toBe(true);
    }
    expect(RETAINABLE_TAB_CACHE_PATHS.has("customers")).toBe(true);
    expect(RETAINABLE_TAB_CACHE_PATHS.has("suppliers")).toBe(true);
  });

  it("keeps outgoing master path within the retention window", () => {
    const map = new Map<string, number>();
    const now = 1_000_000;
    const kept = bumpRecentTabPaneRetention(map, "customers", "suppliers", now);
    expect(kept).toContain("customers");
    expect(kept).not.toContain("suppliers");
  });

  it("expires paths older than the retention window", () => {
    const map = new Map<string, number>([
      ["customers", 0],
      ["employees", 1_000_000],
    ]);
    const now = RECENT_TAB_PANE_RETENTION_MS + 1;
    const kept = bumpRecentTabPaneRetention(map, null, "suppliers", now);
    expect(kept).not.toContain("customers");
    expect(kept).toContain("employees");
  });

  it("LRU-evicts when over the cap", () => {
    const map = new Map<string, number>();
    const base = 10_000;
    const paths = [
      "customers",
      "suppliers",
      "employees",
      "salesman-commission",
      "products",
      "product-dashboard",
    ];
    let now = base;
    let current = "stock-settlement";
    for (const p of paths) {
      bumpRecentTabPaneRetention(map, p, current, now);
      now += 1;
    }
    expect(map.size).toBeLessThanOrEqual(RECENT_TAB_PANE_RETENTION_MAX);
    expect(map.has("customers")).toBe(false);
  });

  it("ignores non-retainable outgoing paths", () => {
    const map = new Map<string, number>();
    const kept = bumpRecentTabPaneRetention(map, "pos-dashboard", "customers", 1);
    expect(kept).toEqual([]);
  });
});
