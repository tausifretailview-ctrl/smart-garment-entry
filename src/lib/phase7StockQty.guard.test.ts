import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PHASE2 = "supabase/migrations/20261129120000_get_dashboard_summary_rpcs.sql";
const PHASE7 = "supabase/migrations/20261202120000_dashboard_stock_summary_stock_qty.sql";

describe("Phase 7 dashboard stock summary uses stock_qty", () => {
  const sql = readFileSync(join(root, PHASE7), "utf8");
  const phase2 = readFileSync(join(root, PHASE2), "utf8");

  it("replaces the function and sums stock_qty, not current_stock", () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.get_dashboard_stock_summary\(p_org_id uuid\)/);
    expect(sql).toMatch(/COALESCE\(SUM\(pv\.stock_qty\), 0\)::bigint AS total_stock_qty/);
    expect(sql).toMatch(/SUM\(pv\.stock_qty::numeric \* COALESCE\(pv\.pur_price, 0\)\)/);
    expect(sql).toMatch(/SUM\(pv\.stock_qty::numeric \* COALESCE\(pv\.sale_price, 0\)\)/);
    expect(sql).not.toMatch(/pv\.current_stock/);
  });

  it("keeps the fail-closed auth.role() guard and grants", () => {
    expect(sql).toMatch(/IF auth\.role\(\) = 'anon'/);
    expect(sql).toMatch(/IF auth\.role\(\) = 'authenticated' AND NOT \(p_org_id IN/);
    expect(sql).not.toMatch(/auth\.uid\(\)\s+IS\s+NOT\s+NULL\s+THEN/i);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_dashboard_stock_summary\(uuid\) FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_dashboard_stock_summary\(uuid\) FROM anon/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_dashboard_stock_summary\(uuid\) TO authenticated, service_role/,
    );
  });

  it("does not rewrite the Phase 2 file (new timestamped migration only)", () => {
    expect(phase2).toMatch(/SUM\(pv\.current_stock\)/);
    expect(PHASE7).toContain("20261202120000");
  });

  it("StatusBar still reads the RPC, not the view", () => {
    const bar = readFileSync(join(root, "src/components/StatusBar.tsx"), "utf8");
    expect(bar).toContain("fetchDashboardStockSummary");
    expect(bar).not.toContain("v_dashboard_stock_summary");
    expect(bar).toContain("stockRow?.total_stock_qty");
  });

  it("barcode stock lookup prefers stock_qty via canonicalOnHandQty", () => {
    const lookup = readFileSync(join(root, "src/utils/lookupBarcodeStock.ts"), "utf8");
    expect(lookup).toContain("canonicalOnHandQty");
    expect(lookup).not.toMatch(/Number\(row\.current_stock \?\? row\.stock_qty\)/);
  });
});
