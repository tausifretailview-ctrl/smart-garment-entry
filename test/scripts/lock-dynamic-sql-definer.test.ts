import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Security scan, Nov 2026: two SECURITY DEFINER functions build SQL from a table name the caller
 * passes. This keeps the fix in place: the delete helper is service-role only (inside the
 * function and by grants), both only accept this app's own tables, and logged-in users lose the
 * row guard only when nothing that runs as the user calls it.
 */
const sql = readFileSync("supabase/migrations/20270512120000_lock_dynamic_sql_definer_functions.sql", "utf8");

describe("dynamic-SQL definer functions are locked down", () => {
  it("delete_child_rows_for_org refuses everyone but the service role", () => {
    expect(sql).toMatch(/IF v_role IS NOT NULL AND v_role <> 'service_role' THEN\s+RAISE EXCEPTION 'Not allowed'/);
    for (const role of ["PUBLIC", "anon", "authenticated"]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.delete_child_rows_for_org(text, text, text, uuid) FROM ${role};`);
    }
    expect(sql).toContain("GRANT EXECUTE ON FUNCTION public.delete_child_rows_for_org(text, text, text, uuid) TO service_role;");
  });

  it("table names are looked up in the catalog, never pasted into the SQL as typed", () => {
    // The delete runs on regclass values found in pg_class (public schema, right columns).
    expect(sql).toMatch(/DELETE FROM %s\s+WHERE %I IN \(SELECT id FROM %s WHERE organization_id = \$1\)/);
    expect(sql).toContain("v_child, p_fk_column, v_parent");
    expect(sql).not.toMatch(/format\([^)]*p_child_table, p_fk_column, p_parent_table/);
    expect(sql).toContain("RAISE EXCEPTION 'Not a shop table'");
  });

  it("the row guard is taken from logged-in users only when nothing running as the user needs it", () => {
    expect(sql).toContain("AND NOT p.prosecdef");
    expect(sql).toContain("FROM pg_policies pol");
    expect(sql).toMatch(/IF v_needed_by IS NULL THEN\s+REVOKE ALL ON FUNCTION public\._assert_row_org_access\(regclass, uuid\) FROM authenticated;/);
    expect(sql).toMatch(/ELSE\s+GRANT EXECUTE ON FUNCTION public\._assert_row_org_access\(regclass, uuid\) TO authenticated;/);
  });

  it("runs as one transaction", () => {
    expect(sql).toMatch(/\nBEGIN;\n/);
    expect(sql).toMatch(/\nCOMMIT;\n/);
  });
});
