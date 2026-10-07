-- Balance Adjustment "advance removed" (customer_advances.manual_used_amount) must not count as
-- credit consumed against bills. The SQL balance functions subtract SUM(used_amount) as "advances
-- applied" and the unused pool separately; the manual part inflated the first (Saniya Mahaldar:
-- bills 19,600 - applied 59,600 = -40,000 Cr although the 40,000 advance was removed on purpose).
--
-- Patches the LIVE function bodies (pg_get_functiondef) so hand-edited live definitions keep their
-- other changes. Per function it replaces two text anchors (or one for reconcile) only when each is
-- found exactly once; otherwise it leaves the function alone and says so. Re-run safe.
--   _get_customer_party_balances_rows(uuid, text), get_customer_financial_snapshot_all(uuid):
--     customer_advance_totals gets total_manual; customer_advance_pools.total_used = used - manual
--     (the unused pool keeps using the full used amount)
--   reconcile_customer_balance(uuid, uuid): advances_applied = -(used - manual)

DO $patch$
DECLARE
  v_targets text[] := ARRAY[
    'public._get_customer_party_balances_rows(uuid, text)',
    'public.get_customer_financial_snapshot_all(uuid)',
    'public.reconcile_customer_balance(uuid, uuid)'
  ];
  v_target text;
  v_oid oid;
  v_def text;
  v_new text;
  v_p1 constant text := 'COALESCE(SUM(ca.used_amount), 0)::numeric AS total_used';
  v_p1n constant text := 'COALESCE(SUM(ca.used_amount), 0)::numeric AS total_used,' || E'\n      ' || 'COALESCE(SUM(ca.manual_used_amount), 0)::numeric AS total_manual';
  v_p2 constant text := 'COALESCE(cat.total_used, 0)::numeric AS total_used,';
  v_p2n constant text := '(COALESCE(cat.total_used, 0) - COALESCE(cat.total_manual, 0))::numeric AS total_used,';
  v_r1 constant text := '(-COALESCE(SUM(ca.used_amount), 0))::numeric';
  v_r1n constant text := '(-(COALESCE(SUM(ca.used_amount), 0) - COALESCE(SUM(ca.manual_used_amount), 0)))::numeric';
  n1 int; n2 int; n3 int;
BEGIN
  FOREACH v_target IN ARRAY v_targets LOOP
    v_oid := to_regprocedure(v_target);
    IF v_oid IS NULL THEN
      RAISE NOTICE '% : not found, skipped', v_target;
      CONTINUE;
    END IF;
    v_def := pg_get_functiondef(v_oid);
    IF position('manual_used_amount' IN v_def) > 0 THEN
      RAISE NOTICE '% : already patched', v_target;
      CONTINUE;
    END IF;

    IF v_target LIKE '%reconcile_customer_balance%' THEN
      n3 := (length(v_def) - length(replace(v_def, v_r1, ''))) / length(v_r1);
      IF n3 <> 1 THEN
        RAISE NOTICE '% : anchor found % times (need 1), skipped', v_target, n3;
        CONTINUE;
      END IF;
      v_new := replace(v_def, v_r1, v_r1n);
    ELSE
      n1 := (length(v_def) - length(replace(v_def, v_p1, ''))) / length(v_p1);
      n2 := (length(v_def) - length(replace(v_def, v_p2, ''))) / length(v_p2);
      IF n1 <> 1 OR n2 <> 1 THEN
        RAISE NOTICE '% : anchors found % / % times (need 1 / 1), skipped', v_target, n1, n2;
        CONTINUE;
      END IF;
      v_new := replace(replace(v_def, v_p1, v_p1n), v_p2, v_p2n);
    END IF;

    EXECUTE v_new;
    RAISE NOTICE '% : patched', v_target;
  END LOOP;
END
$patch$;
