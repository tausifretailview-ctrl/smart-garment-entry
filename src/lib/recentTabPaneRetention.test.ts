import { describe, expect, it } from "vitest";
import {
  bumpRecentTabPaneRetention,
  isRetainableTabCachePath,
  RECENT_TAB_PANE_RETENTION_EXCLUSIONS,
  RECENT_TAB_PANE_RETENTION_MAX,
  RECENT_TAB_PANE_RETENTION_MS,
} from "./recentTabPaneRetention";

describe("recentTabPaneRetention", () => {
  it("retains cacheable registry pages by default (Settings, Accounts, masters)", () => {
    expect(isRetainableTabCachePath("settings")).toBe(true);
    expect(isRetainableTabCachePath("accounts")).toBe(true);
    expect(isRetainableTabCachePath("customers")).toBe(true);
    expect(isRetainableTabCachePath("chart-of-accounts")).toBe(true);
    expect(isRetainableTabCachePath("customer-account-statement")).toBe(true);
  });

  it("excludes user-rights (idle-evict policy) and non-cacheable entry screens", () => {
    expect(RECENT_TAB_PANE_RETENTION_EXCLUSIONS.has("user-rights")).toBe(true);
    expect(isRetainableTabCachePath("user-rights")).toBe(false);
    expect(isRetainableTabCachePath("pos-sales")).toBe(false);
    expect(isRetainableTabCachePath("sales-invoice")).toBe(false);
  });

  it("keeps outgoing Settings/Accounts within the retention window", () => {
    const map = new Map<string, number>();
    const now = 1_000_000;
    const kept = bumpRecentTabPaneRetention(map, "settings", "accounts", now);
    expect(kept).toContain("settings");
    expect(kept).not.toContain("accounts");

    const kept2 = bumpRecentTabPaneRetention(map, "accounts", "customers", now + 1);
    expect(kept2).toContain("settings");
    expect(kept2).toContain("accounts");
  });

  it("expires paths older than the retention window", () => {
    const map = new Map<string, number>([
      ["settings", 0],
      ["accounts", 1_000_000],
    ]);
    const now = RECENT_TAB_PANE_RETENTION_MS + 1;
    const kept = bumpRecentTabPaneRetention(map, null, "customers", now);
    expect(kept).not.toContain("settings");
    expect(kept).toContain("accounts");
  });

  it("LRU-evicts when over the cap", () => {
    const map = new Map<string, number>();
    const base = 10_000;
    const paths = [
      "settings",
      "accounts",
      "customers",
      "suppliers",
      "employees",
      "chart-of-accounts",
      "journal-vouchers",
      "products",
    ];
    let now = base;
    let current = "stock-report";
    for (const p of paths) {
      bumpRecentTabPaneRetention(map, p, current, now);
      now += 1;
    }
    expect(map.size).toBeLessThanOrEqual(RECENT_TAB_PANE_RETENTION_MAX);
    expect(map.has("settings")).toBe(false);
  });

  it("ignores excluded and non-registry outgoing paths", () => {
    const map = new Map<string, number>();
    expect(bumpRecentTabPaneRetention(map, "user-rights", "customers", 1)).toEqual([]);
    expect(bumpRecentTabPaneRetention(map, "pos-sales", "customers", 2)).toEqual([]);
    expect(bumpRecentTabPaneRetention(map, "not-a-real-page", "customers", 3)).toEqual([]);
  });
});
