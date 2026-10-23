-- Customer balance check speed-up (cloud usage check 23 Oct 2026).
--
-- get_customer_financial_snapshot_batch was 32% of all database time since the 19 Oct reset
-- (8,349 calls, 2.2 s each for 10 customers). Per customer it runs reconcile_customer_balance,
-- and two parts of that read far more than one customer's data:
--
--   1) sale_return_adjust_on_invoices LEFT JOINs a GROUP BY over ALL sale_items (every shop),
--      which Postgres cannot narrow to the customer's bills: one full sale_items scan per
--      customer (pg_stat_user_tables: 327k seq scans, 66.9 billion sale_items rows read).
--      Now a LATERAL sum over that bill's lines only (idx_sale_items_sale_id). Same result:
--      no lines gives a NULL gross either way, and every use is COALESCE(ig.gross, 0) > 0.
--
--   2) pending_sale_returns -> _customer_sale_return_credit_total runs the shop-wide
--      _org_sale_return_balance_remaining loop for every customer. That function only returns
--      rows for live sale_returns of the shop, filtered here to this customer, so a customer
--      with no live sale return always gets 0. Now that loop runs only when the customer has
--      one (an uncorrelated EXISTS, so Postgres skips the scan when it is false).
--
-- Patches the LIVE function bodies (pg_get_functiondef) like 20270104140000, so earlier live
-- patches (shop guard, counter tender, manual advance) are kept. Each anchor must be found
-- exactly once, otherwise that function is left alone with a NOTICE. Re-run safe (marker).
-- CREATE OR REPLACE fires the grant-on-new-function event trigger, so EXECUTE rights are put
-- back exactly as they were (same as 20261231120100).

DO $balance_speedup$
DECLARE
  v_oid oid;
  v_def text;
  v_new text;
  v_n int;
  v_anon_had boolean;
  v_auth_had boolean;
  v_items_pat constant text :=
    'LEFT JOIN \(\s*SELECT si\.sale_id, SUM\(COALESCE\(si\.quantity, 0\) \* COALESCE\(si\.mrp, 0\)\) AS gross\s+FROM public\.sale_items si\s+WHERE si\.deleted_at IS NULL\s+GROUP BY si\.sale_id\s*\) ig ON ig\.sale_id = s\.id';
  v_items_new constant text :=
    E'LEFT JOIN LATERAL (\n'
    || E'    SELECT SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0)) AS gross\n'
    || E'    FROM public.sale_items si\n'
    || E'    WHERE si.sale_id = s.id\n'
    || E'      AND si.deleted_at IS NULL\n'
    || E'  ) ig ON true /* items-gross per bill */';
  v_sr_anchor constant text := 'FROM public._org_sale_return_balance_remaining(p_organization_id) rem';
  v_sr_new constant text :=
    E'FROM public._org_sale_return_balance_remaining(p_organization_id) rem\n'
    || E'  WHERE EXISTS (\n'
    || E'    SELECT 1 FROM public.sale_returns sr0\n'
    || E'    WHERE sr0.organization_id = p_organization_id\n'
    || E'      AND sr0.customer_id = p_customer_id\n'
    || E'      AND sr0.deleted_at IS NULL\n'
    || E'  ) /* skip shop return scan */';
BEGIN
  v_oid := to_regprocedure('public.reconcile_customer_balance(uuid, uuid)');
  IF v_oid IS NULL THEN
    RAISE NOTICE 'reconcile_customer_balance: not found, skipped';
  ELSE
    v_def := pg_get_functiondef(v_oid);
    IF position('/* items-gross per bill */' IN v_def) > 0 THEN
      RAISE NOTICE 'reconcile_customer_balance: already patched';
    ELSE
      SELECT count(*) INTO v_n FROM regexp_matches(v_def, v_items_pat, 'g');
      IF v_n <> 1 THEN
        RAISE NOTICE 'reconcile_customer_balance: anchor found % times (need 1), skipped', v_n;
      ELSE
        v_new := regexp_replace(v_def, v_items_pat, v_items_new);
        v_anon_had := has_function_privilege('anon', v_oid, 'EXECUTE');
        v_auth_had := has_function_privilege('authenticated', v_oid, 'EXECUTE');
        EXECUTE v_new;
        IF NOT v_auth_had THEN
          EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, authenticated', v_oid::regprocedure);
        END IF;
        IF NOT v_anon_had THEN
          EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_oid::regprocedure);
        END IF;
        RAISE NOTICE 'reconcile_customer_balance: patched';
      END IF;
    END IF;
  END IF;

  v_oid := to_regprocedure('public._customer_sale_return_credit_total(uuid, uuid)');
  IF v_oid IS NULL THEN
    RAISE NOTICE '_customer_sale_return_credit_total: not found, skipped';
  ELSE
    v_def := pg_get_functiondef(v_oid);
    IF position('/* skip shop return scan */' IN v_def) > 0 THEN
      RAISE NOTICE '_customer_sale_return_credit_total: already patched';
    ELSIF position('p_customer_id' IN v_def) = 0
       OR position('rem.out_customer_id = p_customer_id' IN v_def) = 0 THEN
      RAISE NOTICE '_customer_sale_return_credit_total: body not as expected, skipped';
    ELSE
      v_n := (length(v_def) - length(replace(v_def, v_sr_anchor, ''))) / length(v_sr_anchor);
      IF v_n <> 1 THEN
        RAISE NOTICE '_customer_sale_return_credit_total: anchor found % times (need 1), skipped', v_n;
      ELSE
        v_new := regexp_replace(
          v_def,
          'FROM public\._org_sale_return_balance_remaining\(p_organization_id\) rem\s+WHERE ',
          v_sr_new || E'\n    AND '
        );
        IF v_new = v_def THEN
          RAISE NOTICE '_customer_sale_return_credit_total: WHERE after anchor not found, skipped';
        ELSE
          v_anon_had := has_function_privilege('anon', v_oid, 'EXECUTE');
          v_auth_had := has_function_privilege('authenticated', v_oid, 'EXECUTE');
          EXECUTE v_new;
          IF NOT v_auth_had THEN
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, authenticated', v_oid::regprocedure);
          END IF;
          IF NOT v_anon_had THEN
            EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', v_oid::regprocedure);
          END IF;
          RAISE NOTICE '_customer_sale_return_credit_total: patched';
        END IF;
      END IF;
    END IF;
  END IF;
END
$balance_speedup$;
