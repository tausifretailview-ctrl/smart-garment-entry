import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearDashboardFilters,
  dashboardFilterStorageKey,
  readDashboardFilters,
  sanitizePersistedFiltersForToday,
  writeDashboardFilters,
} from "./dashboardFilterPersistence";

function installMemoryStorage() {
  const create = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      clear: () => map.clear(),
      key: (i: number) => [...map.keys()][i] ?? null,
      get length() {
        return map.size;
      },
    };
  };
  Object.defineProperty(globalThis, "localStorage", {
    value: create(),
    configurable: true,
  });
  Object.defineProperty(globalThis, "sessionStorage", {
    value: create(),
    configurable: true,
  });
}

describe("dashboardFilterPersistence namespacing", () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("stores under org + user + page and does not leak across users", () => {
    writeDashboardFilters("org-a", "pos-dashboard", { searchQuery: "alice" }, "user-1");
    writeDashboardFilters("org-a", "pos-dashboard", { searchQuery: "bob" }, "user-2");

    expect(readDashboardFilters("org-a", "pos-dashboard", "user-1")).toMatchObject({
      searchQuery: "alice",
    });
    expect(readDashboardFilters("org-a", "pos-dashboard", "user-2")).toMatchObject({
      searchQuery: "bob",
    });
    expect(dashboardFilterStorageKey("org-a", "user-1", "pos-dashboard")).toBe(
      "dashboard_filters_v2:org-a:user-1:pos-dashboard",
    );
  });

  it("does not leak filters across organizations", () => {
    writeDashboardFilters("org-a", "pos-dashboard", { searchQuery: "shop-a" }, "user-1");
    writeDashboardFilters("org-b", "pos-dashboard", { searchQuery: "shop-b" }, "user-1");

    expect(readDashboardFilters("org-a", "pos-dashboard", "user-1")).toMatchObject({
      searchQuery: "shop-a",
    });
    expect(readDashboardFilters("org-b", "pos-dashboard", "user-1")).toMatchObject({
      searchQuery: "shop-b",
    });
  });

  it("clearDashboardFilters removes only that page snapshot", () => {
    writeDashboardFilters("org-a", "pos-dashboard", { searchQuery: "x" }, "user-1");
    writeDashboardFilters("org-a", "sales-invoice-dashboard", { searchQuery: "y" }, "user-1");
    clearDashboardFilters("org-a", "pos-dashboard", "user-1");

    expect(readDashboardFilters("org-a", "pos-dashboard", "user-1")).toBeNull();
    expect(readDashboardFilters("org-a", "sales-invoice-dashboard", "user-1")).toMatchObject({
      searchQuery: "y",
    });
  });

  it("migrates legacy sessionStorage v1 into localStorage v2 once", () => {
    sessionStorage.setItem(
      "dashboard_filters_v1:org-a:pos-dashboard",
      JSON.stringify({ searchQuery: "legacy", periodFilter: "daily" }),
    );

    const read = readDashboardFilters("org-a", "pos-dashboard", "user-1");
    expect(read).toMatchObject({ searchQuery: "legacy", periodFilter: "daily" });
    expect(sessionStorage.getItem("dashboard_filters_v1:org-a:pos-dashboard")).toBeNull();
    expect(localStorage.getItem("dashboard_filters_v2:org-a:user-1:pos-dashboard")).toBeTruthy();
  });
});

describe("sanitizePersistedFiltersForToday", () => {
  it("keeps absolute dates on the same calendar day", () => {
    const now = new Date(2026, 7, 8, 10, 0, 0);
    const out = sanitizePersistedFiltersForToday(
      {
        _savedOn: "2026-08-08",
        periodFilter: "daily",
        startDate: "2026-08-08",
        endDate: "2026-08-08",
      },
      now,
    );
    expect(out.startDate).toBe("2026-08-08");
    expect(out.periodFilter).toBe("daily");
  });

  it("drops frozen daily dates after day boundary but keeps period intent", () => {
    const now = new Date(2026, 7, 9, 9, 0, 0); // Aug 9
    const out = sanitizePersistedFiltersForToday(
      {
        _savedOn: "2026-08-08",
        periodFilter: "daily",
        startDate: "2026-08-08",
        endDate: "2026-08-08",
        searchQuery: "keep-me",
      },
      now,
    );
    expect(out.periodFilter).toBe("daily");
    expect(out.searchQuery).toBe("keep-me");
    expect(out.startDate).toBeUndefined();
    expect(out.endDate).toBeUndefined();
  });

  it("keeps custom ranges across day boundary", () => {
    const now = new Date(2026, 7, 9, 9, 0, 0);
    const out = sanitizePersistedFiltersForToday(
      {
        _savedOn: "2026-08-08",
        periodFilter: "custom",
        startDate: "2026-07-01",
        endDate: "2026-07-31",
      },
      now,
    );
    expect(out.startDate).toBe("2026-07-01");
    expect(out.endDate).toBe("2026-07-31");
  });
});
