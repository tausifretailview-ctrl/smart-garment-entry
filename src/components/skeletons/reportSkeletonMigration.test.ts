import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPORT_MIGRATED_FILES = [
  "src/pages/SalesAnalyticsDashboard.tsx",
  "src/pages/AccountingReports.tsx",
  "src/pages/ExpenseSalaryReport.tsx",
  "src/pages/NetProfitAnalysis.tsx",
  "src/pages/PriceHistoryReport.tsx",
] as const;

describe("REPORT skeleton migration", () => {
  it("every migrated file imports ReportPageSkeleton", () => {
    for (const rel of REPORT_MIGRATED_FILES) {
      const src = readFileSync(join("/workspace", rel), "utf8");
      expect(src, rel).toMatch(/ReportPageSkeleton/);
    }
  });

  it("does not gate ReportPageSkeleton on isFetching", () => {
    for (const rel of REPORT_MIGRATED_FILES) {
      const src = readFileSync(join("/workspace", rel), "utf8");
      expect(src, rel).not.toMatch(
        /isFetching\s*\?\s*[\s\S]{0,240}<ReportPageSkeleton/,
      );
    }
  });

  it("AccountingReports GL tabs use isLoading for body shells", () => {
    const src = readFileSync(
      "/workspace/src/pages/AccountingReports.tsx",
      "utf8",
    );
    expect(src).toMatch(/glTrialQuery\.isLoading\s*\?/);
    expect(src).toMatch(/glPnlQuery\.isLoading\s*\?/);
    expect(src).toMatch(/glBsQuery\.isLoading\s*\?/);
    expect(src).not.toMatch(/glTrialQuery\.isFetching\s*\?\s*[\s\S]{0,80}<ReportPageSkeleton/);
  });

  it("ReportPageSkeleton keeps fixed chart height default", () => {
    const src = readFileSync(
      "/workspace/src/components/skeletons/ReportPageSkeleton.tsx",
      "utf8",
    );
    expect(src).toContain("chartHeightPx = 260");
    expect(src).toContain("min-h-[200px]");
  });
});
