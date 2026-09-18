import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("invalidateProductDashboardQueries", () => {
  it("refetches product-catalog even when Product Dashboard is unmounted", () => {
    const src = readFileSync(resolve(here, "./invalidateDashboardQueries.ts"), "utf8");
    expect(src).toContain("export function invalidateProductDashboardQueries");
    expect(src).toContain('["product-catalog"');
    expect(src).toContain('["product-dashboard-stats"');
    expect(src).toContain('refetchType: "all"');
  });

  it("is called from Product Entry save/import and the dashboard Refresh path", () => {
    const entry = readFileSync(resolve(here, "../pages/ProductEntry.tsx"), "utf8");
    expect(entry).toContain("invalidateProductDashboardQueries");
    expect(entry).toContain("data-entry-form");
    expect(entry).toContain("handleEnterAsTab");
    expect(entry).not.toContain("invalidateStockReportQueries");

    const dashboard = readFileSync(resolve(here, "../pages/ProductDashboard.tsx"), "utf8");
    expect(dashboard).toContain("invalidateProductDashboardQueries");
    expect(dashboard).toMatch(
      /refreshProductDashboard[\s\S]*invalidateProductDashboardQueries/,
    );
  });
});
