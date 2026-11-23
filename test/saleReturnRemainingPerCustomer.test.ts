import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * _org_sale_return_balance_remaining is worked out customer by customer (20270520120000),
 * with the same rules and output as 20261219120100 (review item D10: shop-wide jsonb totals
 * made it grow with the square of the shop's history). Equivalence was checked on random data
 * against the previous body on a local Postgres; this keeps the shape that makes it fast.
 */
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20270520120000_sale_return_remaining_per_customer.sql"),
  "utf8",
);

describe("remaining sale-return credit, per customer", () => {
  it("keeps the same signature and output columns", () => {
    expect(sql).toContain("CREATE OR REPLACE FUNCTION public._org_sale_return_balance_remaining(p_organization_id uuid)");
    expect(sql).toMatch(/RETURNS TABLE \(\s*sale_return_id uuid,\s*out_customer_id uuid,\s*remaining numeric\s*\)/);
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public._org_sale_return_balance_remaining(uuid) TO authenticated, service_role;");
  });

  it("walks bills and returns once, ordered by customer, and resets the totals per customer", () => {
    expect(sql).toContain("ORDER BY x.cid, x.kind, x.rdate NULLS LAST, x.rcreated NULLS LAST, x.rorder");
    expect(sql).toContain("IF cur_cid IS DISTINCT FROM r.cid THEN");
    expect(sql).toMatch(/leftover_amt := '\{\}'::jsonb;\s*consumed := '\{\}'::jsonb;/);
  });

  it("keeps the rules: same-customer bills only, refunded returns net of allocated adjust", () => {
    expect(sql).toContain("IF NOT (leftover_amt ? r.lid) THEN");
    expect(sql).toContain("COALESCE(sr.net_amount, 0) - COALESCE(al.amt, 0)");
    expect(sql).toContain("public._sale_return_remaining_credit_for_balance(");
  });
});
