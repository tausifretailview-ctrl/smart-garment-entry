/**
 * Phase 3 search RPC + sale_items.organization_id migration guards.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATION = "supabase/migrations/20261130120000_sale_items_org_search_rpc.sql";

const ANON_GUARD = `IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;`;

const ORG_GUARD = `IF auth.role() = 'authenticated' AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;`;

describe("sale_items organization_id + search_line_item_sale_ids", () => {
  const sql = readFileSync(join(root, MIGRATION), "utf8");

  it("backfills in batches, not one unbounded UPDATE", () => {
    expect(sql).toMatch(/LIMIT v_batch/);
    expect(sql).toMatch(/LOOP/);
    expect(sql).not.toMatch(
      /UPDATE public\.sale_items si\s+SET organization_id = s\.organization_id\s+FROM public\.sales s\s+WHERE si\.sale_id = s\.id\s*;/,
    );
  });

  it("validates backfill against parent sales before NOT NULL", () => {
    expect(sql).toMatch(/v_matched <> v_items/);
    expect(sql).toMatch(/ALTER COLUMN organization_id SET NOT NULL/);
    expect(sql.indexOf("v_matched")).toBeLessThan(sql.indexOf("SET NOT NULL"));
  });

  it("syncs organization_id on INSERT and on sale_id re-parenting", () => {
    expect(sql).toMatch(/BEFORE INSERT OR UPDATE OF sale_id/);
    expect(sql).toMatch(/NEW\.sale_id IS DISTINCT FROM OLD\.sale_id/);
  });

  it("uses the two-step auth.role() guard (not uid-IS-NOT-NULL skip)", () => {
    expect(sql).toContain(ANON_GUARD);
    expect(sql).toContain(ORG_GUARD);
    expect(sql).not.toMatch(/auth\.uid\(\)\s+IS\s+NOT\s+NULL\s+THEN/i);
    expect(sql).not.toMatch(/PERFORM public\.assert_org_member/);
  });

  it("filters sale_items by organization_id inside the query", () => {
    expect(sql).toMatch(/WHERE si\.organization_id = p_org_id/);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
  });

  it("grants execute only to authenticated + service_role", () => {
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.search_line_item_sale_ids\(uuid, text, date, date, int, text\[\]\) TO authenticated, service_role/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.search_line_item_sale_ids\(uuid, text, date, date, int, text\[\]\) FROM PUBLIC/,
    );
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.search_line_item_sale_ids\(uuid, text, date, date, int, text\[\]\) FROM anon/,
    );
  });
});
