-- Applied CN / S/R adjust ignored on discounted bills (KS Footwear: SONI SHOES Net Position 5,014 vs ledger 2,624).
--
-- NOT YET APPLIED to production. Apply to a non-production copy first and compare balances.
--
-- Problem: the balance SQL treats sales.sale_return_adjust (sra) as "already baked into net_amount"
-- whenever  net + sra <= SUM(qty * mrp) + 1.  On discounted / wholesale bills MRP totals are far above
-- the billed amount, so a CN applied AFTER billing (net is still the full bill) is skipped and the
-- customer is overstated by the CN.
--
-- Rule added (validated on production data, 2026-10-06, all organizations, 29 flagged bills):
--   the CN is on top of a full bill  <=>  |net - (gross_amount - discounts + round_off)| <= 0.5
--   i.e. net_amount still EQUALS the full bill by header.  Then it must be deducted.
--   23 bills matched (KS Footwear 18, ELLA NOOR 2, Gurukrupa 2, ALBELI 1); SONI INV/26-27/1184: net 14,141 = full 14,141, CN 2,390.
--   6 POS bills (VELVET 4, SACCHI 1, DEMO 1) have net far BELOW the full bill (reduced by more than the CN,
--   e.g. VELVET POS/26-27/754: full 2,895, net 805, CN 1,095): they are left exactly as today (CN not deducted again).
--
-- This migration PATCHES THE LIVE DEFINITIONS (pg_get_functiondef -> regexp_replace -> EXECUTE) instead of
-- re-creating them from repo copies, so anything applied directly in production is preserved.
-- It only touches functions in schema public whose body contains the exact old clause, skips ones already
-- patched (marker comment), and raises if nothing matched. Any error rolls the whole migration back.
--
-- Dry run (changes nothing) - list the functions that would be patched:
--   SELECT p.oid::regprocedure FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.prosrc ~ 's\.net_amount \+ COALESCE\(s\.sale_return_adjust, 0\) <= ig\.gross \+ 1'
--     AND p.prosrc NOT LIKE '%cn-header-gate%';

DO $patch$
DECLARE
  v_fn regprocedure;
  v_def text;
  v_new text;
  v_patched int := 0;
  v_pattern constant text :=
    's\.net_amount \+ COALESCE\(s\.sale_return_adjust, 0\) <= ig\.gross \+ 1';
  v_replacement constant text :=
    's.net_amount + COALESCE(s.sale_return_adjust, 0) <= ig.gross + 1 '
    || '/* cn-header-gate */ AND NOT ( COALESCE(s.gross_amount, 0) > 0 '
    || 'AND ABS(s.net_amount '
    || '- (COALESCE(s.gross_amount, 0) '
    || '- (COALESCE(s.discount_amount, 0) + COALESCE(s.flat_discount_amount, 0) + COALESCE(s.points_redeemed_amount, 0)) '
    || '+ COALESCE(s.round_off, 0))) > 0.5 )';
BEGIN
  FOR v_fn IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosrc ~ v_pattern
      AND p.prosrc NOT LIKE '%cn-header-gate%'
    ORDER BY p.oid::regprocedure::text
  LOOP
    v_def := pg_get_functiondef(v_fn);
    v_new := regexp_replace(v_def, v_pattern, v_replacement, 'g');
    IF v_new = v_def THEN
      RAISE EXCEPTION 'pattern matched prosrc but not the function definition for %', v_fn;
    END IF;
    EXECUTE v_new;
    v_patched := v_patched + 1;
    RAISE NOTICE 'patched %', v_fn;
  END LOOP;

  IF v_patched = 0 THEN
    RAISE EXCEPTION 'cn-header-gate: no function contained the expected clause; nothing patched';
  END IF;
END
$patch$;

-- Verify (run before and after on a non-production copy), SONI SHOES expected to drop by 2,390:
--   SELECT * FROM public.get_customer_financial_snapshot('<soni customer id>', '<ks footwear org id>');
-- and compare all customers before/after:
--   SELECT * FROM public.get_customer_financial_snapshot_all('<ks footwear org id>');
-- Expected: the 18 KS Footwear bills (16 customers) + 5 bills in ALBELI / ELLA NOOR / Gurukrupa change;
-- VELVET, SACCHI and DEMO customers must NOT change.
