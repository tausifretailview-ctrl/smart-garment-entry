/** @vitest-environment jsdom */
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.fn();
const rights: { admin: boolean; allowed: Set<string> } = { admin: true, allowed: new Set() };
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganization: () => ({ currentOrganization: { id: "o1", name: "Krishna Textiles" } }) }));
vi.mock("@/hooks/useOrgNavigation", () => ({ useOrgNavigation: () => ({ orgNavigate: nav }) }));
vi.mock("@/hooks/useUserPermissions", () => ({
  useUserPermissions: () => ({
    isAdmin: rights.admin,
    permissions: rights.admin ? null : { menu: {} },
    hasMenuAccess: (id: string) => rights.allowed.has(id),
    loading: false,
  }),
}));
vi.mock("@/lib/tabPageRegistry", () => ({ prefetchTabPage: vi.fn() }));

import {
  LAUNCHER_FAVOURITES_KEY,
  LAUNCHER_RECENTS_KEY,
  LAUNCHER_TILES,
  greetingFor,
  isWholesaleDashboardEnabled,
  parseLauncherPathList,
  pushRecent,
  searchLauncherTiles,
  toggleFavourite,
  visibleLauncherTiles,
} from "./wholesaleLauncher";
import { getMenuPermissionForPath } from "./menuPermissions";
import { WholesaleLauncher } from "@/components/dashboard/WholesaleLauncher";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Wholesale Dashboard (app launcher)", () => {
  beforeEach(() => {
    nav.mockReset();
    rights.admin = true;
    rights.allowed = new Set();
    localStorage.clear();
  });

  it("is off unless switched on in Settings", () => {
    expect(isWholesaleDashboardEnabled(undefined)).toBe(false);
    expect(isWholesaleDashboardEnabled({})).toBe(false);
    expect(isWholesaleDashboardEnabled({ wholesale_dashboard: true })).toBe(true);
  });

  it("every tile is a page with a menu right, so rights decide who sees it", () => {
    for (const t of LAUNCHER_TILES) expect(getMenuPermissionForPath(t.path), t.path).toBeTruthy();
    expect(new Set(LAUNCHER_TILES.map((t) => t.path)).size).toBe(LAUNCHER_TILES.length);
    const salesOnly = visibleLauncherTiles((id) => id === "sales_invoice" || id === "customer_master", false);
    expect(salesOnly.map((t) => t.path)).toEqual(["sales-invoice", "customers", "transporters"]);
    expect(visibleLauncherTiles(() => false, true)).toHaveLength(LAUNCHER_TILES.length);
  });

  it("search finds by name first, then by group and other words", () => {
    expect(searchLauncherTiles(LAUNCHER_TILES, "stock").map((t) => t.path)).toEqual(["stock-report", "stock-analysis"]);
    expect(searchLauncherTiles(LAUNCHER_TILES, "outstanding").map((t) => t.path)).toEqual(["customer-party-balances", "supplier-party-balances"]);
    expect(searchLauncherTiles(LAUNCHER_TILES, "zzz")).toEqual([]);
    expect(searchLauncherTiles(LAUNCHER_TILES, "  ")).toBe(LAUNCHER_TILES);
  });

  it("keeps favourites and recents tidy", () => {
    expect(parseLauncherPathList('["sales-invoice","nope","sales-invoice",5]')).toEqual(["sales-invoice"]);
    expect(parseLauncherPathList("{bad")).toEqual([]);
    expect(pushRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    expect(pushRecent(["1", "2", "3", "4", "5", "6"], "7")).toEqual(["7", "1", "2", "3", "4", "5"]);
    expect(toggleFavourite(["a"], "a")).toEqual([]);
    expect(toggleFavourite(["a"], "b")).toEqual(["a", "b"]);
    expect(greetingFor(new Date(2026, 0, 1, 9))).toBe("Good morning");
    expect(greetingFor(new Date(2026, 0, 1, 14))).toBe("Good afternoon");
    expect(greetingFor(new Date(2026, 0, 1, 20))).toBe("Good evening");
  });

  it("opens a page, remembers it as recent, pins favourites and searches with Enter", () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => root.render(<WholesaleLauncher />));
    expect(host.textContent).toContain("Krishna Textiles");
    const tile = (label: string) =>
      Array.from(host.querySelectorAll("button")).find((b) => b.textContent === label) as HTMLButtonElement;
    act(() => tile("Sale Invoice").click());
    expect(nav).toHaveBeenCalledWith("/sales-invoice");
    expect(JSON.parse(localStorage.getItem(LAUNCHER_RECENTS_KEY)!)).toEqual(["sales-invoice"]);
    expect(host.querySelector('[aria-label="Recently opened"]')?.textContent).toContain("Sale Invoice");
    act(() => (host.querySelector('[aria-label="Add Purchase Bill to favourites"]') as HTMLButtonElement).click());
    expect(JSON.parse(localStorage.getItem(LAUNCHER_FAVOURITES_KEY)!)).toEqual(["purchase-entry"]);
    expect(host.querySelector('[aria-label="Favourites"]')?.textContent).toContain("Purchase Bill");
    const search = host.querySelector('input[aria-label="Find a page"]') as HTMLInputElement;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "receiv");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    act(() => search.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(nav).toHaveBeenLastCalledWith("/customer-party-balances");
    act(() => root.unmount());
    host.remove();
  });

  it("shows only pages the user's rights open", () => {
    rights.admin = false;
    rights.allowed = new Set(["purchase_bill", "stock_report"]);
    const host = document.createElement("div");
    const root = createRoot(host);
    act(() => root.render(<WholesaleLauncher />));
    const labels = Array.from(host.querySelectorAll(".wl-tile button:first-child")).map((b) => b.textContent);
    expect(labels).toEqual(["Purchase Bill", "Stock"]);
    act(() => root.unmount());
  });

  it("home and Settings are wired; the figures page loads only under Overview", () => {
    const index = read("src/pages/Index.tsx");
    expect(index).toContain("isWholesaleDashboardEnabled(");
    expect(index).toContain('{view === "apps" ? <WholesaleLauncher /> : <DesktopDashboard />}');
    const settings = read("src/pages/Settings.tsx");
    expect(settings).toContain('id="wholesale_dashboard"');
    expect(settings).toContain("checked={settings.sale_settings?.wholesale_dashboard === true}");
  });
});
