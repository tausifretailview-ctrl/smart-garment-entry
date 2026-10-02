import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isFillHeightDashboardPath, isHideGlobalHeaderPath } from "@/lib/entryPageLayout";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

describe("Product dashboard Insights chrome", () => {
  it("fills the shell and hides the global header like Insights", () => {
    expect(isFillHeightDashboardPath("/demo/products")).toBe(true);
    expect(isHideGlobalHeaderPath("/demo/products")).toBe(true);
    expect(isHideGlobalHeaderPath("/demo/product-entry")).toBe(false);
    expect(isFillHeightDashboardPath("/demo/product-entry")).toBe(false);
  });

  it("drops the title and KPI bars and keeps stock filter on the search row", () => {
    const page = readFileSync(resolve(repoRoot, "src/pages/ProductDashboard.tsx"), "utf8");
    expect(page).not.toContain("Remaining Stock");
    expect(page).not.toContain("Browse inventory");
    expect(page).not.toContain("ProductKpiCard");
    const stockAt = page.indexOf('id="stock-level-filter"');
    const panelAt = page.indexOf("Filter Products");
    const searchAt = page.indexOf('placeholder="Search name, brand, or barcode..."');
    expect(searchAt).toBeGreaterThan(-1);
    expect(stockAt).toBeGreaterThan(searchAt);
    expect(panelAt).toBeGreaterThan(stockAt);
  });
});
