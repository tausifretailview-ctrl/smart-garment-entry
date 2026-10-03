import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DASHBOARD_SLOW_MOVING_IDLE_DAYS,
  INSIGHTS_DEAD_SLOW_MOVING_STATE,
  isDeadSlowMovingInsightsState,
} from "./dashboardStockHealth";

const here = dirname(fileURLToPath(import.meta.url));
const indexSrc = readFileSync(resolve(here, "../pages/Index.tsx"), "utf8");
const insightsSrc = readFileSync(resolve(here, "../pages/BusinessInsights.tsx"), "utf8");
const stockHealthSrc = readFileSync(
  resolve(here, "../components/business-insights/StockHealthTab.tsx"),
  "utf8",
);

describe("dashboard stock health card", () => {
  it("uses the insights 60-day dead / slow moving list", () => {
    expect(DASHBOARD_SLOW_MOVING_IDLE_DAYS).toBe(60);
    expect(isDeadSlowMovingInsightsState(INSIGHTS_DEAD_SLOW_MOVING_STATE)).toBe(true);
    expect(isDeadSlowMovingInsightsState({ insightsTab: "stock-health" })).toBe(false);
    expect(isDeadSlowMovingInsightsState(null)).toBe(false);
  });

  it("places the card after Receivables and opens Dead / Slow Moving", () => {
    const receivables = indexSrc.indexOf('title="Receivables"');
    const stockHealth = indexSrc.indexOf('title="Stock Health"');
    expect(receivables).toBeGreaterThan(-1);
    expect(stockHealth).toBeGreaterThan(receivables);
    expect(indexSrc).toContain("INSIGHTS_DEAD_SLOW_MOVING_STATE");
    expect(indexSrc).toContain("useSlowMovingStock");
    expect(indexSrc).toContain("DASHBOARD_SLOW_MOVING_IDLE_DAYS");
    expect(indexSrc).toContain('caption="Dead / Slow Moving"');
    expect(insightsSrc).toContain("isDeadSlowMovingInsightsState");
    expect(stockHealthSrc).toContain('initialSubTab = "low-stock"');
    expect(stockHealthSrc).toContain("setSubTab(initialSubTab)");
  });
});
