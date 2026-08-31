import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

describe("Recycle Bin Insights chrome", () => {
  it("uses the Business Insights workspace, KPI strip, pill tabs, and dark table", () => {
    const page = readFileSync(resolve(repoRoot, "src/pages/RecycleBin.tsx"), "utf8");
    expect(page).toContain("business-insights-workspace");
    expect(page).toContain("InsightsPanel");
    expect(page).toContain("InsightsKpiStrip");
    expect(page).toContain("InsightsTableHeader");
    expect(page).toContain("INSIGHTS_BODY_ROW");
    expect(page).toContain("RECYCLE_TAB_TRIGGER");
    expect(page).toContain("data-[state=active]:bg-slate-700");
    expect(page).toMatch(/isLoading \? \(/);
    expect(page).toContain("ListTableSkeleton");
    expect(page).not.toContain("text-3xl font-bold");
    expect(page).not.toContain('variant="destructive" className="ml-1 h-5');
  });

  it("fills the dashboard shell like Insights", () => {
    const layout = readFileSync(resolve(repoRoot, "src/lib/entryPageLayout.ts"), "utf8");
    expect(layout).toContain("recycle-bin");
    expect(layout).toMatch(/FILL_HEIGHT_DASHBOARD_PATH[\s\S]*recycle-bin/);
  });
});
