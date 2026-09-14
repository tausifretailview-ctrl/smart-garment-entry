import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

describe("Salesman Commission Insights chrome", () => {
  it("uses Insights workspace, KPI cards, panels, and qty column", () => {
    const page = readFileSync(resolve(repoRoot, "src/pages/SalesmanCommission.tsx"), "utf8");
    expect(page).toContain("business-insights-workspace");
    expect(page).toContain("InsightsPanel");
    expect(page).toContain("InsightsKpiCard");
    expect(page).toContain("InsightsTableHeader");
    expect(page).toContain("Qty");
    expect(page).toContain("quantity");
    expect(page).toContain("DailySalesmanIncentivePanel");
  });

  it("fills the dashboard shell like Insights and hides top chrome", () => {
    const layout = readFileSync(resolve(repoRoot, "src/lib/entryPageLayout.ts"), "utf8");
    expect(layout).toMatch(/FILL_HEIGHT_DASHBOARD_PATH[\s\S]*salesman-commission/);
    expect(layout).toMatch(/SIDEBAR_ONLY_WORKSPACE_PATH[\s\S]*salesman-commission/);
  });
});
