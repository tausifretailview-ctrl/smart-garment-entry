/**
 * Phase 2 RPCs must use the fail-closed auth.role() guard, not the
 * `auth.uid() IS NOT NULL` skip that already shipped in get_low_stock_alerts
 * / get_slow_moving_stock.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION = "supabase/migrations/20261129120000_get_dashboard_summary_rpcs.sql";

const ANON_GUARD = `IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;`;

const ORG_GUARD = `IF auth.role() = 'authenticated' AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;`;

describe("get_dashboard_* summary RPCs", () => {
  const sql = readFileSync(join(root, MIGRATION), "utf8");

  it("uses the two-step auth.role() guard twice (stock + purchase)", () => {
    expect(sql.split(ANON_GUARD).length - 1).toBe(2);
    expect(sql.split(ORG_GUARD).length - 1).toBe(2);
  });

  it("does not use the fail-open uid-IS-NOT-NULL skip", () => {
    expect(sql).not.toMatch(/auth\.uid\(\)\s+IS\s+NOT\s+NULL\s+THEN/i);
  });

  it("sets search_path and grants execute only to authenticated + service_role", () => {
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_dashboard_stock_summary\(uuid\) TO authenticated, service_role/,
    );
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_dashboard_purchase_summary\(uuid, date\) TO authenticated, service_role/,
    );
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_dashboard_stock_summary\(uuid\) FROM PUBLIC/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.get_dashboard_stock_summary\(uuid\) FROM anon/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_dashboard_purchase_summary\(uuid, date\) FROM PUBLIC/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_dashboard_purchase_summary\(uuid, date\) FROM anon/,
    );
  });

  it("applies organization_id inside the query (not RLS-only)", () => {
    expect(sql).toMatch(/WHERE pv\.organization_id = p_org_id/);
    expect(sql).toMatch(/WHERE p\.organization_id = p_org_id/);
  });
});
