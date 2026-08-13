import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Repo root, derived from this file's own location.
 *
 * This was previously hardcoded to "/workspace" -- the Cloud Agent container root --
 * so these three suites could only ever pass inside that container and failed with
 * ENOENT on every other checkout. Deriving it from import.meta.url makes the suite
 * runnable anywhere and does not depend on the working directory vitest was started from.
 */
const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

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
      const src = readFileSync(join(REPO_ROOT, rel), "utf8");
      expect(src, rel).toMatch(/ReportPageSkeleton/);
    }
  });

  it("does not gate ReportPageSkeleton on isFetching", () => {
    for (const rel of REPORT_MIGRATED_FILES) {
      const src = readFileSync(join(REPO_ROOT, rel), "utf8");
      expect(src, rel).not.toMatch(
        /isFetching\s*\?\s*[\s\S]{0,240}<ReportPageSkeleton/,
      );
    }
  });

  it("AccountingReports GL tabs use isLoading for body shells", () => {
    const src = readFileSync(
      join(REPO_ROOT, "src/pages/AccountingReports.tsx"),
      "utf8",
    );
    // Body shells must gate on isLoading (optionally && !data to keep stale
    // rows visible). A bare `isLoading ?` check missed the current form:
    // `isLoading && !glTrialQuery.data ?`.
    expect(src).toMatch(/glTrialQuery\.isLoading(?:\s*&&\s*!glTrialQuery\.data)?\s*\?/);
    expect(src).toMatch(/glPnlQuery\.isLoading(?:\s*&&\s*!glPnlQuery\.data)?\s*\?/);
    expect(src).toMatch(/glBsQuery\.isLoading(?:\s*&&\s*!glBsQuery\.data)?\s*\?/);
    expect(src).not.toMatch(/glTrialQuery\.isFetching\s*\?\s*[\s\S]{0,80}<ReportPageSkeleton/);
  });

  it("ReportPageSkeleton keeps fixed chart height default", () => {
    const src = readFileSync(
      join(REPO_ROOT, "src/components/skeletons/ReportPageSkeleton.tsx"),
      "utf8",
    );
    expect(src).toContain("chartHeightPx = 260");
    expect(src).toContain("min-h-[200px]");
  });
});
