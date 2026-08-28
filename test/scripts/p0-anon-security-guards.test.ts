import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const MIGRATIONS = path.join(ROOT, "supabase/migrations");

const ALLOWLIST_SQL = path.join(
  MIGRATIONS,
  "20260828190000_event_trigger_anon_allowlist.sql",
);
const FAIL_OPEN_SQL = path.join(
  MIGRATIONS,
  "20260828190100_fix_fail_open_org_guards.sql",
);
const REMAINING_SQL = path.join(
  MIGRATIONS,
  "20260828200000_fix_remaining_fail_open_guards.sql",
);

/**
 * The 9 functions the bulk rewrite skipped, triaged against live definitions.
 * Two are already fail-closed by a different idiom and must stay untouched.
 */
const ALREADY_FAIL_CLOSED = [
  "get_customer_ledger_anomalies",
  "get_wappconnect_instance_masked",
];
const REMAINING_FIXED = [
  "detect_balance_adjustment_drift",
  "compute_sale_settlement_v2",
  "get_stock_at_time",
  "get_stock_at_time_batch",
  "get_sale_items_gross_batch",
  "_zero_unscanned_candidates",
  "detect_orphan_purchase_stock",
];

/** Every function that must stay callable by the anon role. */
/** Drop `--` comment lines so assertions inspect executable SQL only. */
function executableSql(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

const ANON_ALLOWLIST = [
  "get_org_public_info",
  "login_attempts_rate_ok",
  "get_public_storefront",
  "submit_public_storefront_enquiry",
  "has_role",
  "has_org_role",
  "is_org_admin",
  "is_entry_creator_or_admin",
  "user_belongs_to_org",
  "get_user_organization_ids",
];

/** The 37 read-only SECURITY DEFINER functions locked down on 18 Aug 2026. */
const READ_FUNCTIONS_37 = [
  "compute_sale_settlement_v2",
  "detect_balance_adjustment_drift",
  "detect_orphan_purchase_stock",
  "detect_stock_discrepancies",
  "get_accounting_drift_report",
  "get_brand_performance",
  "get_category_performance",
  "get_customer_financial_snapshot",
  "get_customer_financial_snapshot_all",
  "get_customer_financial_snapshot_batch",
  "get_customer_ledger_anomalies",
  "get_customer_party_balances",
  "get_customer_segment_counts",
  "get_customer_segment_index",
  "get_gl_account_ledger",
  "get_gl_trial_balance",
  "get_low_stock_alerts",
  "get_orphaned_products",
  "get_pending_gl_backfill_counts",
  "get_product_filter_options",
  "get_product_performance",
  "get_product_wise_stock_filter_options",
  "get_product_wise_stock_report",
  "get_product_wise_stock_report_totals",
  "get_sale_items_gross_batch",
  "get_sales_daily_summary",
  "get_slow_moving_stock",
  "get_stock_at_time",
  "get_stock_at_time_batch",
  "get_stock_reconciliation",
  "get_stock_report",
  "get_stock_report_filter_options",
  "get_stock_report_filtered_totals",
  "get_supplier_party_balances",
  "get_supplier_performance",
  "get_wappconnect_instance_masked",
  "_zero_unscanned_candidates",
];

describe("event-trigger anon allowlist", () => {
  it("allowlists all 10 anon-callable functions, not just the 3 from the storefront migration", async () => {
    const sql = await readFile(ALLOWLIST_SQL, "utf8");
    for (const fn of ANON_ALLOWLIST) {
      expect(sql, `${fn} missing from allowlist`).toContain(`'${fn}'`);
    }
  });

  it("matches on proname so schema-qualification rendering cannot break the allowlist", async () => {
    const sql = executableSql(await readFile(ALLOWLIST_SQL, "utf8"));
    expect(sql).toMatch(/p\.proname/);
    // The old form compared regprocedure text against 'public.<fn>(args)', which never
    // matches while the trigger runs with SET search_path = public.
    expect(sql).not.toMatch(/NOT IN \(\s*'public\./);
  });

  it("re-grants anon explicitly rather than only skipping the revoke", async () => {
    const sql = await readFile(ALLOWLIST_SQL, "utf8");
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION %s TO anon, authenticated, service_role/);
  });

  it("documents the DISABLE escape hatch and leaves the trigger enabled", async () => {
    const sql = await readFile(ALLOWLIST_SQL, "utf8");
    expect(sql).toContain(
      "ALTER EVENT TRIGGER trg_revoke_public_execute_on_new_functions DISABLE;",
    );
    expect(sql).toMatch(
      /ALTER EVENT TRIGGER trg_revoke_public_execute_on_new_functions ENABLE;/,
    );
  });
});

describe("fail-open org guard fix", () => {
  it("covers all 37 read functions from the August audit", async () => {
    const sql = await readFile(FAIL_OPEN_SQL, "utf8");
    for (const fn of READ_FUNCTIONS_37) {
      expect(sql, `${fn} not covered`).toContain(`'${fn}'`);
    }
    expect(READ_FUNCTIONS_37).toHaveLength(37);
  });

  it("rejects anon via auth.role(), never via a bare auth.uid() IS NULL reject", async () => {
    const sql = executableSql(await readFile(FAIL_OPEN_SQL, "utf8"));
    expect(sql).toMatch(/auth\.role\(\)\s*=\s*''anon''/);
    // `auth.uid() IS NULL -> RAISE` would also reject service_role (ai-assistant) and
    // in-database pg_cron callers (stock-alerts-scan-4h), changing live behaviour.
    expect(sql).not.toMatch(/IF\s+auth\.uid\(\)\s+IS\s+NULL\s+OR/i);
  });

  it("preserves the existing authenticated membership check unchanged", async () => {
    const sql = await readFile(FAIL_OPEN_SQL, "utf8");
    // The anon guard is prepended; the original guard is re-emitted verbatim so the
    // authenticated code path stays byte-identical.
    expect(sql).toContain("IF auth.uid() IS NOT NULL THEN");
  });

  it("does not silently skip a function whose guard it cannot find", async () => {
    const sql = await readFile(FAIL_OPEN_SQL, "utf8");
    expect(sql).toMatch(/RAISE WARNING 'fail-open fix SKIPPED/);
  });

  it("keeps the 37 revoked from anon and granted to authenticated + service_role", async () => {
    const sql = await readFile(FAIL_OPEN_SQL, "utf8");
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;/);
  });

  it("keeps service_role and pg_cron callers out of the reject path", async () => {
    const sql = await readFile(FAIL_OPEN_SQL, "utf8");
    // Documented non-user callers that must keep working.
    expect(sql).toContain("ai-assistant");
    expect(sql).toContain("stock-alerts-scan-4h");
  });
});

describe("remaining fail-open guards (the 9 the bulk rewrite skipped)", () => {
  it("fixes the 7 that need it", async () => {
    const sql = await readFile(REMAINING_SQL, "utf8");
    for (const fn of REMAINING_FIXED) {
      expect(sql, `${fn} not handled`).toContain(fn);
    }
  });

  it("leaves the 2 already-fail-closed functions untouched", async () => {
    const body = executableSql(await readFile(REMAINING_SQL, "utf8"));
    for (const fn of ALREADY_FAIL_CLOSED) {
      expect(body, `${fn} must not be redefined`).not.toMatch(
        new RegExp(`CREATE OR REPLACE FUNCTION public\\.${fn}\\s*\\(`),
      );
    }
  });

  it("guards LANGUAGE sql bodies with a NULL-safe predicate", async () => {
    const sql = executableSql(await readFile(REMAINING_SQL, "utf8"));
    // IS DISTINCT FROM keeps NULL (in-database pg_cron / trigger callers) passing;
    // a plain <> would evaluate to NULL and silently drop their rows.
    expect(sql).toMatch(/auth\.role\(\)\s+IS DISTINCT FROM\s+'anon'/);
    expect(sql).not.toMatch(/auth\.role\(\)\s*<>\s*'anon'/);
  });

  it("preserves the service_role / pg_cron all-orgs branch in detect_orphan_purchase_stock", async () => {
    const sql = await readFile(REMAINING_SQL, "utf8");
    expect(sql).toMatch(
      /auth\.uid\(\) IS NULL\s*\n\s*OR sm\.organization_id IN \(SELECT public\.get_user_organization_ids/,
    );
  });

  it("builds newlines with chr(10), never E'\\\\n' inside a dollar-quoted body", async () => {
    const sql = executableSql(await readFile(REMAINING_SQL, "utf8"));
    // E'\\n' inside $$...$$ yields a literal backslash-n and corrupts the rewritten
    // definition — this produced a real syntax error during verification.
    expect(sql).toContain("chr(10)");
    expect(sql).not.toMatch(/E'\\\\n'/);
  });
});
