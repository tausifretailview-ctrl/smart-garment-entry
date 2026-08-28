-- Verification for the two P0 security migrations:
--   20260828190000_event_trigger_anon_allowlist.sql
--   20260828190100_fix_fail_open_org_guards.sql
--
-- Run in the Supabase SQL editor AFTER both migrations are applied.
-- Sections 1-3 are read-only. Section 2 runs inside an explicit transaction that is
-- ROLLED BACK, so it leaves no trace. Section 4 needs one real user id and org id.

-- =====================================================================
-- 1. Event trigger is installed AND enabled
--    evtenabled: 'O' = enabled (origin), 'D' = DISABLED  <-- must not be 'D'
-- =====================================================================
SELECT evtname,
       evtenabled,
       CASE WHEN evtenabled = 'D' THEN 'FAIL - trigger is disabled'
            ELSE 'PASS - trigger enabled' END AS verdict
FROM pg_event_trigger
WHERE evtname = 'trg_revoke_public_execute_on_new_functions';


-- =====================================================================
-- 2. PROOF the allowlist works: create one canary with an allowlisted
--    name and one without, let the event trigger fire on both, compare
--    the resulting anon grant, then roll everything back.
-- =====================================================================
BEGIN;

-- Allowlisted name (new overload; discarded on rollback).
CREATE OR REPLACE FUNCTION public.has_org_role(_canary_probe text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT 'canary'::text $$;

-- Non-allowlisted name.
CREATE OR REPLACE FUNCTION public.zz_canary_not_allowlisted(_probe text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public
AS $$ SELECT 'canary'::text $$;

SELECT 'has_org_role(text) [allowlisted]' AS fn,
       has_function_privilege('anon', 'public.has_org_role(text)', 'EXECUTE') AS anon_execute,
       CASE WHEN has_function_privilege('anon', 'public.has_org_role(text)', 'EXECUTE')
            THEN 'PASS - anon grant survived the event trigger'
            ELSE 'FAIL - allowlist did not hold' END AS verdict
UNION ALL
SELECT 'zz_canary_not_allowlisted(text) [not allowlisted]',
       has_function_privilege('anon', 'public.zz_canary_not_allowlisted(text)', 'EXECUTE'),
       CASE WHEN has_function_privilege('anon', 'public.zz_canary_not_allowlisted(text)', 'EXECUTE')
            THEN 'FAIL - anon should have been revoked'
            ELSE 'PASS - anon revoked as expected' END;

ROLLBACK;


-- =====================================================================
-- 3. Steady-state grants
-- =====================================================================

-- 3a. All 10 allowlisted functions must be anon-executable.
SELECT p.oid::regprocedure AS fn,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       CASE WHEN has_function_privilege('anon', p.oid, 'EXECUTE')
            THEN 'PASS' ELSE 'FAIL - login / storefront / RLS will break' END AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND pg_get_function_result(p.oid) <> 'trigger'
  AND p.proname IN (
    'get_org_public_info','login_attempts_rate_ok','get_public_storefront',
    'submit_public_storefront_enquiry','has_role','has_org_role','is_org_admin',
    'is_entry_creator_or_admin','user_belongs_to_org','get_user_organization_ids'
  )
ORDER BY 1;

-- 3b. All 37 read functions must remain anon-REVOKED. Expect zero rows.
SELECT p.oid::regprocedure AS fn, 'FAIL - anon can still execute' AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND has_function_privilege('anon', p.oid, 'EXECUTE')
  AND p.proname IN (
    'compute_sale_settlement_v2','detect_balance_adjustment_drift',
    'detect_orphan_purchase_stock','detect_stock_discrepancies',
    'get_accounting_drift_report','get_brand_performance','get_category_performance',
    'get_customer_financial_snapshot','get_customer_financial_snapshot_all',
    'get_customer_financial_snapshot_batch','get_customer_ledger_anomalies',
    'get_customer_party_balances','get_customer_segment_counts',
    'get_customer_segment_index','get_gl_account_ledger','get_gl_trial_balance',
    'get_low_stock_alerts','get_orphaned_products','get_pending_gl_backfill_counts',
    'get_product_filter_options','get_product_performance',
    'get_product_wise_stock_filter_options','get_product_wise_stock_report',
    'get_product_wise_stock_report_totals','get_sale_items_gross_batch',
    'get_sales_daily_summary','get_slow_moving_stock','get_stock_at_time',
    'get_stock_at_time_batch','get_stock_reconciliation','get_stock_report',
    'get_stock_report_filter_options','get_stock_report_filtered_totals',
    'get_supplier_party_balances','get_supplier_performance',
    'get_wappconnect_instance_masked','_zero_unscanned_candidates'
  )
ORDER BY 1;

-- 3c. Every one of the 37 now carries the anon guard. Expect zero rows.
SELECT p.oid::regprocedure AS fn, 'FAIL - still fail-open' AS verdict
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef
  AND pg_get_functiondef(p.oid) !~ 'auth\.role\(\)\s*=\s*''anon'''
  AND p.proname IN (
    'compute_sale_settlement_v2','detect_balance_adjustment_drift',
    'detect_orphan_purchase_stock','detect_stock_discrepancies',
    'get_accounting_drift_report','get_brand_performance','get_category_performance',
    'get_customer_financial_snapshot','get_customer_financial_snapshot_all',
    'get_customer_financial_snapshot_batch','get_customer_ledger_anomalies',
    'get_customer_party_balances','get_customer_segment_counts',
    'get_customer_segment_index','get_gl_account_ledger','get_gl_trial_balance',
    'get_low_stock_alerts','get_orphaned_products','get_pending_gl_backfill_counts',
    'get_product_filter_options','get_product_performance',
    'get_product_wise_stock_filter_options','get_product_wise_stock_report',
    'get_product_wise_stock_report_totals','get_sale_items_gross_batch',
    'get_sales_daily_summary','get_slow_moving_stock','get_stock_at_time',
    'get_stock_at_time_batch','get_stock_reconciliation','get_stock_report',
    'get_stock_report_filter_options','get_stock_report_filtered_totals',
    'get_supplier_party_balances','get_supplier_performance',
    'get_wappconnect_instance_masked','_zero_unscanned_candidates'
  )
ORDER BY 1;


-- =====================================================================
-- 4. NO-UI-IMPACT PROOF: a real staff member still gets their own data.
--    Replace the two UUIDs below with a real user_id and an org that
--    user belongs to (any row from organization_members).
--
--      SELECT user_id, organization_id, role
--      FROM organization_members LIMIT 5;
-- =====================================================================
\set staff_user '00000000-0000-0000-0000-000000000000'
\set staff_org  '00000000-0000-0000-0000-000000000000'

BEGIN;
SET LOCAL role authenticated;
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', :'staff_user', 'role', 'authenticated')::text,
  true
);

-- Sanity: the simulated session looks like a real logged-in user.
SELECT auth.uid() AS uid, auth.role() AS role;

-- Representative reads across POS / Stock / Accounts / Insights.
-- Each must return rows (or an empty set) WITHOUT raising 42501.
SELECT 'get_low_stock_alerts'        AS fn, count(*) AS rows FROM public.get_low_stock_alerts(:'staff_org'::uuid, 5)
UNION ALL
SELECT 'get_customer_party_balances',      count(*) FROM public.get_customer_party_balances(:'staff_org'::uuid)
UNION ALL
SELECT 'get_supplier_party_balances',      count(*) FROM public.get_supplier_party_balances(:'staff_org'::uuid)
UNION ALL
SELECT 'get_sales_daily_summary',          count(*) FROM public.get_sales_daily_summary(:'staff_org'::uuid, 30)
UNION ALL
SELECT 'get_stock_report_filter_options',  count(*) FROM public.get_stock_report_filter_options(:'staff_org'::uuid)
UNION ALL
SELECT 'get_product_filter_options',       count(*) FROM public.get_product_filter_options(:'staff_org'::uuid)
UNION ALL
SELECT 'get_customer_segment_index',       count(*) FROM public.get_customer_segment_index(:'staff_org'::uuid);
ROLLBACK;


-- 4b. Cross-org denial still works for an authenticated user (unchanged behaviour).
--     Expect: ERROR 42501 'Not authorized for this organization'.
-- BEGIN;
-- SET LOCAL role authenticated;
-- SELECT set_config('request.jwt.claims',
--   json_build_object('sub', :'staff_user', 'role','authenticated')::text, true);
-- SELECT * FROM public.get_low_stock_alerts('<SOME-OTHER-ORG-UUID>'::uuid, 5);
-- ROLLBACK;


-- 4c. service_role path still passes (this is what ai-assistant uses).
--     Expect rows, NOT 42501.
BEGIN;
SET LOCAL role service_role;
SELECT set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
SELECT count(*) AS service_role_rows
FROM public.get_customer_party_balances(:'staff_org'::uuid);
ROLLBACK;


-- 4d. anon is now rejected by the function body itself, not just the grant.
--     Expect: ERROR 42501.
BEGIN;
SET LOCAL role postgres;  -- owner can execute; claims below make it look like anon
SELECT set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
DO $$
BEGIN
  PERFORM * FROM public.get_low_stock_alerts(
    (SELECT id FROM public.organizations LIMIT 1), 5
  );
  RAISE WARNING 'FAIL - anon was NOT rejected by the function body';
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'PASS - anon rejected by function body (42501)';
END $$;
ROLLBACK;
