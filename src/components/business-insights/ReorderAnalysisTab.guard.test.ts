import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "../../..");

describe("Reorder Analysis tab wiring", () => {
  it("registers a lazy-mounted 7th Insights tab", () => {
    const page = readFileSync(join(here, "../../pages/BusinessInsights.tsx"), "utf8");
    expect(page).toContain('"reorder-analysis"');
    expect(page).toContain("Reorder Analysis");
    expect(page).toContain("shouldMountTab(\"reorder-analysis\")");
    expect(page).toContain("ReorderAnalysisTab");
  });

  it("uses INSIGHTS_STALE_TIME and the fail-closed RPC", () => {
    const hook = readFileSync(join(here, "../../hooks/useBusinessInsights.ts"), "utf8");
    expect(hook).toContain("useReorderAnalysis");
    expect(hook).toContain("insights-reorder-analysis");
    expect(hook).toContain("get_reorder_analysis");
    expect(hook).toContain("staleTime: INSIGHTS_STALE_TIME");
  });

  it("new RPC uses auth.role() fail-closed, not uid-is-not-null skip", () => {
    const sql = readFileSync(
      join(root, "supabase/migrations/20261128120000_get_reorder_analysis.sql"),
      "utf8",
    );
    expect(sql).toContain("auth.role() = 'anon'");
    expect(sql).toContain("get_user_organization_ids(auth.uid())");
    expect(sql).not.toMatch(/IF auth\.uid\(\) IS NOT NULL THEN/);
    expect(sql).toContain("GRANT EXECUTE");
    expect(sql).toContain("REVOKE EXECUTE");
  });
});
