import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Stock Report search, supplier and invoice filters look up the latest purchase bill only for
 * variants bought on a bill that passes the filter (20270521120000, review item D11), instead
 * of for every variant of the shop. Equivalence with 20270306120000 was checked on random data
 * on a local Postgres; this keeps the shape that makes it fast and the shop check.
 */
const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20270521120000_stock_report_search_latest_purchase_per_variant.sql"),
  "utf8",
);
const listStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.get_stock_report(");
const totalsStart = sql.indexOf("CREATE OR REPLACE FUNCTION public.get_stock_report_filtered_totals(");
const list = sql.slice(listStart, totalsStart);
const totals = sql.slice(totalsStart);

describe("stock report: latest purchase bill looked up per matching variant", () => {
  it("no longer sorts every purchase line of the shop", () => {
    expect(sql).not.toContain("variant_purchase_source AS");
    expect(sql).not.toContain("DISTINCT ON (pi.sku_id)");
    expect(list).toContain("search_hint AS");
    expect(list).toContain("supplier_hint AS");
    expect(list).toContain("invoice_hint AS");
    expect(totals).toContain("supplier_hint AS");
    expect(totals).toContain("invoice_hint AS");
  });

  it("checks the hint before the per-variant lookup, with the previous latest-bill order", () => {
    expect(list).toMatch(/pv\.id IN \(SELECT sh\.variant_id FROM search_hint sh\)\s+AND COALESCE\(\(/);
    expect(list).toMatch(/pv\.id IN \(SELECT su\.variant_id FROM supplier_hint su\)\s+AND public\.normalize_product_brand_key\(\(/);
    expect(list).toMatch(/pv\.id IN \(SELECT ih\.variant_id FROM invoice_hint ih\)\s+AND lower\(trim\(COALESCE\(\(/);
    expect(sql.match(/pi2\.id DESC\s+LIMIT 1/g)?.length).toBe(5);
    expect(list).toContain("OR v_search_matches_all");
  });

  it("keeps signatures, grants, jit off and the shop check in both functions", () => {
    for (const body of [list, totals]) {
      expect(body).toContain("SET jit = off");
      expect(body).toContain("IF auth.role() = 'anon' THEN");
      expect(body).toContain("p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))");
      expect(body.indexOf("get_user_organization_ids")).toBeLessThan(body.indexOf("_hint AS"));
    }
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_stock_report(uuid, integer, integer, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text, boolean) TO authenticated, service_role;",
    );
    expect(sql).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_stock_report_filtered_totals(uuid, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text, boolean) TO authenticated, service_role;",
    );
  });

  it("refuses to replace a live body that is not the expected version", () => {
    expect(sql).toContain("is not the 20270306120000 version; nothing was changed");
  });
});
