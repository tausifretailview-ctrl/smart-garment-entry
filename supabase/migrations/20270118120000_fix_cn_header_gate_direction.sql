-- Correct the direction of the cn-header-gate added by 20270109120000.
--
-- The first copy of 20270109120000 skipped the CN when net_amount EQUALS the full bill by header
-- (AND NOT (... ABS(net - full) > 0.5)), which is the opposite of its own rule:
--   * CN applied after billing (net = full bill, e.g. KS Footwear SONI SHOES INV/26-27/1184):
--     must be DEDUCTED, but stayed skipped -> balance too high.
--   * POS bill already reduced (net far below full bill, e.g. VELVET POS/26-27/754):
--     must stay as before (CN not deducted), but was deducted a second time -> balance too low.
-- The app's JS twin (customerBalanceCore.ts fullBillByHeader, |net - full| <= 0.5) is already right.
--
-- Production (checked 2026-10-10) carries a variant, ABS(net + CN - full) > 0.5, which deducts the CN on
-- every bill except one already reduced by exactly the CN, so VELVET / SACCHI still lose it twice.
-- Fix: both known forms -> ABS(net - full) <= 0.5 inside the gate, on the LIVE definitions
-- (pg_get_functiondef -> plain replace -> EXECUTE), so anything else applied in production is preserved.
-- Only functions that carry the old gate and not the v2 marker are touched. If 20270109120000 was
-- never applied (or was applied from the corrected copy), there is nothing to patch and this is a no-op.
--
-- Dry run (changes nothing) - functions that would be patched:
--   SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosrc LIKE '%cn-header-gate */%'
--     AND p.prosrc NOT LIKE '%cn-header-gate-v2%';

DO $fix$
DECLARE
  v_fn regprocedure;
  v_def text;
  v_new text;
  v_patched int := 0;
  v_live constant text :=
    '/* cn-header-gate */ AND NOT ( COALESCE(s.gross_amount, 0) > 0 AND ABS(s.net_amount + COALESCE(s.sale_return_adjust, 0) - (COALESCE(s.gross_amount, 0) - (COALESCE(s.discount_amount, 0) + COALESCE(s.flat_discount_amount, 0) + COALESCE(s.points_redeemed_amount, 0)) + COALESCE(s.round_off, 0))) > 0.5 )';
  v_repo constant text :=
    '/* cn-header-gate */ AND NOT ( COALESCE(s.gross_amount, 0) > 0 AND ABS(s.net_amount - (COALESCE(s.gross_amount, 0) - (COALESCE(s.discount_amount, 0) + COALESCE(s.flat_discount_amount, 0) + COALESCE(s.points_redeemed_amount, 0)) + COALESCE(s.round_off, 0))) > 0.5 )';
  v_fixed constant text :=
    '/* cn-header-gate */ AND NOT ( COALESCE(s.gross_amount, 0) > 0 AND ABS(s.net_amount - (COALESCE(s.gross_amount, 0) - (COALESCE(s.discount_amount, 0) + COALESCE(s.flat_discount_amount, 0) + COALESCE(s.points_redeemed_amount, 0)) + COALESCE(s.round_off, 0))) <= 0.5 /* cn-header-gate-v2 */ )';
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosrc LIKE '%cn-header-gate */%'
      AND p.prosrc NOT LIKE '%cn-header-gate-v2%'
    ORDER BY p.oid::regprocedure::text
  LOOP
    v_def := pg_get_functiondef(v_fn);
    v_new := replace(replace(v_def, v_live, v_fixed), v_repo, v_fixed);
    IF v_new = v_def THEN
      RAISE EXCEPTION 'cn-header-gate-v2: gate found but not in a known form in %', v_fn;
    END IF;
    EXECUTE v_new;
    v_patched := v_patched + 1;
    RAISE NOTICE 'patched %', v_fn;
  END LOOP;

  RAISE NOTICE 'cn-header-gate-v2: % function(s) patched', v_patched;
END
$fix$;

-- Verify after applying:
--   SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosrc LIKE '%cn-header-gate */%'
--     AND p.prosrc NOT LIKE '%cn-header-gate-v2%';      -- expect 0 rows
-- SONI SHOES (KS Footwear) keeps the CN deducted (2,390 below its pre-20270109120000 value);
-- VELVET / SACCHI / DEMO customers return to their values from before 20270109120000.
