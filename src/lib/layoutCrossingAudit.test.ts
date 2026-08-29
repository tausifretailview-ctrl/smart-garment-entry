import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COMMAND_PALETTE_REGISTRY } from "./commandPaletteRegistry";
import {
  destinationsWithNoWatchdog,
  directedLayoutCrossingPairs,
  layoutForPath,
  pathsByLayout,
  uniqueRegistryPaths,
  watchdogCoverageForDestination,
} from "./layoutCrossingAudit";

const here = dirname(fileURLToPath(import.meta.url));

function clickDestinationsFromChrome(): string[] {
  const files = [
    "../components/desktop/HeaderMenubar.tsx",
    "../components/Header.tsx",
    "../components/POSLayout.tsx",
    "../components/AppSidebar.tsx",
    "./commandPaletteRegistry.ts",
  ];
  const paths = new Set<string>();
  for (const rel of files) {
    const src = readFileSync(join(here, rel), "utf8");
    for (const m of src.matchAll(/(?:orgNavigate|to|path):\s*["'`]\/([^"'`?]+)/g)) {
      paths.add(m[1].replace(/\/$/, ""));
    }
    for (const m of src.matchAll(/(?:orgNavigate|navigate)\(["'`]\/([^"'`?]+)/g)) {
      paths.add(m[1].replace(/\/$/, ""));
    }
    for (const m of src.matchAll(/NavLink to=["'`]\/([^"'`?]+)/g)) {
      paths.add(m[1].replace(/\/$/, ""));
    }
  }
  for (const item of COMMAND_PALETTE_REGISTRY) {
    paths.add(item.path.replace(/^\//, "").split("?")[0]);
  }
  return [...paths].sort();
}

describe("layout-crossing audit", () => {
  it("has exactly 12 directed layout pairs (4 layouts × 3 others)", () => {
    const pairs = directedLayoutCrossingPairs();
    expect(pairs).toHaveLength(12);
    expect(new Set(pairs.map(([a, b]) => `${a}->${b}`)).size).toBe(12);
  });

  it("counts unique registry pages per layout", () => {
    const by = pathsByLayout();
    expect(by.pos).toEqual(["pos-sales"]);
    expect(by["pos-dc"]).toEqual(["pos-delivery-challan"]);
    expect(by.fullscreen).toHaveLength(16);
    expect(by.layout).toHaveLength(63);
    expect(uniqueRegistryPaths()).toHaveLength(81);
  });

  it("only purchase-entry gets the 6s cacheable-entry remount", () => {
    const remount = uniqueRegistryPaths().filter(
      (p) => watchdogCoverageForDestination(p).cacheableRemount6s,
    );
    expect(remount).toEqual(["purchase-entry"]);
  });

  it("lists long-budget Outlet destinations with no watchdog (the coverage gap)", () => {
    const none = destinationsWithNoWatchdog();
    expect(none).toEqual(
      expect.arrayContaining([
        "pos-sales",
        "pos-delivery-challan",
        "sales-invoice",
        "sale-return-entry",
        "quotation-entry",
        "sale-order-entry",
        "purchase-return-entry",
      ]),
    );
    expect(none).not.toContain("purchase-entry");
    expect(none).not.toContain("pos-dashboard");
    expect(none).not.toContain("barcode-printing");
    expect(none).toHaveLength(7);
  });

  it("POS → purchase-entry is covered only by the 6s remount, not 1.2s/4s", () => {
    const cov = watchdogCoverageForDestination("purchase-entry");
    expect(cov.blankFrame12s).toBe(false);
    expect(cov.outletRescue4s).toBe(false);
    expect(cov.cacheableRemount6s).toBe(true);
  });

  it("POS → pos-dashboard (fullscreen tab-cache) is covered by 1.2s/4s", () => {
    const cov = watchdogCoverageForDestination("pos-dashboard");
    expect(cov.blankFrame12s).toBe(true);
    expect(cov.outletRescue4s).toBe(true);
    expect(cov.cacheableRemount6s).toBe(false);
  });

  it("chrome click destinations cross every layout pair involving pos / fullscreen / layout", () => {
    const dests = clickDestinationsFromChrome();
    const layouts = new Set(
      dests.map((p) => layoutForPath(p)).filter((l): l is NonNullable<typeof l> => l != null),
    );
    expect(layouts.has("pos")).toBe(true);
    expect(layouts.has("fullscreen")).toBe(true);
    expect(layouts.has("layout")).toBe(true);
    const fromPos = dests.filter((p) => {
      const l = layoutForPath(p);
      return l != null && l !== "pos";
    });
    expect(fromPos.length).toBeGreaterThan(8);
  });
});
