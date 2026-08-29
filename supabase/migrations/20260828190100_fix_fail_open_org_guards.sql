-- P0 SECURITY (defense-in-depth): close the fail-open org guard in the 37 read-only
-- SECURITY DEFINER functions locked down on 18 Aug 2026.
--
-- CURRENT (fail-open) SHAPE
--   IF auth.uid() IS NOT NULL THEN
--     <org membership check; RAISE if not a member>
--   END IF;
-- An anonymous caller has auth.uid() = NULL, so the whole check is skipped and
-- SECURITY DEFINER bypasses RLS. Unreachable today because EXECUTE is revoked from
-- PUBLIC/anon at the grant level, but the second layer should also be correct.
--
-- WHY NOT THE LITERAL `IF auth.uid() IS NULL OR NOT (...) THEN RAISE` FORM
-- auth.uid() is ALSO NULL for legitimate non-user callers, so that form would reject
-- them and change live behaviour. Two are confirmed in this codebase:
--   * get_customer_party_balances(uuid) is called by the `ai-assistant` edge function
--     through a SERVICE_ROLE client (supabase/functions/ai-assistant/index.ts) - the
--     "pending / outstanding / due" assistant answers would start throwing 42501.
--   * detect_stock_discrepancies(uuid) is called from scan_stock_alerts_for_org() ->
--     scan_stock_alerts_all_orgs(), run by the pg_cron job 'stock-alerts-scan-4h'
--     every 4 hours; in-database callers have auth.uid() AND auth.role() = NULL, so
--     stock alerts would break for every org.
-- Instead this uses the auth.role() four-way discriminator already mandated by
-- .cursor/rules/backend-core-invariants.mdc and already used in
-- 20260822183000_snapshot_facet_semantics.sql:
--     'anon'          -> reject
--     'authenticated' -> existing membership check (UNCHANGED)
--     'service_role'  -> pass
--     NULL            -> in-database caller (trigger / pg_cron) -> pass
--
-- TRANSFORMATION
-- The anon rejection is PREPENDED; the existing guard is left byte-for-byte intact.
-- The authenticated code path is therefore provably identical to today, which is what
-- keeps this invisible to POS, Purchase Entry, Accounts and every other screen.
--
-- Definitions are read from pg_get_functiondef() (live DB state) rather than re-pasted
-- from this repo, so any hotfix applied directly to the database is preserved.
-- Idempotent: functions already carrying an anon guard are skipped.

DO $$
DECLARE
  target_names CONSTANT text[] := ARRAY[
    'compute_sale_settlement_v2',
    'detect_balance_adjustment_drift',
    'detect_orphan_purchase_stock',
    'detect_stock_discrepancies',
    'get_accounting_drift_report',
    'get_brand_performance',
    'get_category_performance',
    'get_customer_financial_snapshot',
    'get_customer_financial_snapshot_all',
    'get_customer_financial_snapshot_batch',
    'get_customer_ledger_anomalies',
    'get_customer_party_balances',
    'get_customer_segment_counts',
    'get_customer_segment_index',
    'get_gl_account_ledger',
    'get_gl_trial_balance',
    'get_low_stock_alerts',
    'get_orphaned_products',
    'get_pending_gl_backfill_counts',
    'get_product_filter_options',
    'get_product_performance',
    'get_product_wise_stock_filter_options',
    'get_product_wise_stock_report',
    'get_product_wise_stock_report_totals',
    'get_sale_items_gross_batch',
    'get_sales_daily_summary',
    'get_slow_moving_stock',
    'get_stock_at_time',
    'get_stock_at_time_batch',
    'get_stock_reconciliation',
    'get_stock_report',
    'get_stock_report_filter_options',
    'get_stock_report_filtered_totals',
    'get_supplier_party_balances',
    'get_supplier_performance',
    'get_wappconnect_instance_masked',
    '_zero_unscanned_candidates'
  ];
  anon_guard CONSTANT text :=
    'IF auth.role() = ''anon'' THEN' || E'\n' ||
    '    RAISE EXCEPTION ''Not authorized for this organization'' USING ERRCODE = ''42501'';' || E'\n' ||
    '  END IF;' || E'\n' || E'\n' ||
    '  IF auth.uid() IS NOT NULL THEN';
  r record;
  v_def text;
  v_new text;
  n_fixed int := 0;
  n_already int := 0;
  n_manual int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.proname = ANY (target_names)
      AND p.prosecdef
    ORDER BY 2
  LOOP
    v_def := pg_get_functiondef(r.oid);

    -- Already fail-closed for anon.
    IF v_def ~ 'auth\.role\(\)\s*=\s*''anon''' THEN
      n_already := n_already + 1;
      CONTINUE;
    END IF;

    -- Prepend the anon rejection at the existing guard; replace first occurrence only.
    v_new := regexp_replace(
      v_def,
      'IF\s+auth\.uid\(\)\s+IS\s+NOT\s+NULL\s+THEN',
      anon_guard
    );

    IF v_new = v_def THEN
      -- No recognised guard: do NOT guess where to insert. Report for manual review.
      RAISE WARNING 'fail-open fix SKIPPED (no auth.uid() guard found): %', r.sig;
      n_manual := n_manual + 1;
      CONTINUE;
    END IF;

    EXECUTE v_new;
    n_fixed := n_fixed + 1;
  END LOOP;

  RAISE NOTICE 'fail-open guard fix: % rewritten, % already fail-closed, % need manual review',
    n_fixed, n_already, n_manual;
END $$;

-- The event trigger fired once per rewritten function above. None of these 37 are on the
-- anon allowlist, so each was re-revoked from PUBLIC/anon and re-granted to
-- authenticated + service_role - which is exactly the intended end state. Re-assert it
-- explicitly so this migration does not depend on trigger ordering.
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND p.prosecdef
      AND pg_get_function_result(p.oid) <> 'trigger'
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
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'grants re-asserted on % read function(s)', n;
END $$;
