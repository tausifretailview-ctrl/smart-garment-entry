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

  it("keeps the old KPI cards, hides the page title, and defaults stock to greater than 0", () => {
    const page = readFileSync(resolve(repoRoot, "src/pages/ProductDashboard.tsx"), "utf8");
    expect(page).toContain("ProductKpiCard");
    expect(page).toContain("Remaining Stock");
    expect(page).toContain("Remain Value (Pur)");
    expect(page).toContain("Remain Value (Sale)");
    expect(page).not.toContain("Browse inventory");
    expect(page).toContain('useState<string>(DEFAULT_STOCK_LEVEL)');
    expect(page).toContain('const DEFAULT_STOCK_LEVEL = "in_stock"');
    const stockAt = page.indexOf('id="stock-level-filter"');
    const panelAt = page.indexOf("Filter Products");
    const searchAt = page.indexOf('placeholder="Search name, brand, or barcode..."');
    const cardsAt = page.indexOf("Remaining Stock");
    expect(searchAt).toBeGreaterThan(-1);
    expect(cardsAt).toBeGreaterThan(-1);
    expect(cardsAt).toBeLessThan(searchAt);
    expect(stockAt).toBeGreaterThan(searchAt);
    expect(panelAt).toBeGreaterThan(stockAt);
  });
});
