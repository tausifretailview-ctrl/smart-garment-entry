-- Counter tender can never credit a bill beyond its amount.
--
-- 20261231200000 started counting counter tender (sales.cash/card/upi) PLUS later receipts so a
-- ₹1,100 counter payment and a ₹4,300 later receipt on a ₹5,400 bill both count (Gurukrupa
-- SARASWATI JI). But on many bills the tender columns hold the payment MODE chosen at billing
-- while the money only arrived later as a receipt for the full amount (Mulund Mobility
-- POS/26-27/694: tender ₹1,59,999 + RCP/26-27/2613 ₹1,59,999 on a ₹1,59,999 bill). Counting both
-- made those customers look ₹1,59,999 in credit.
--
-- The two cases look identical in the data, so the rule is: counter tender counts only up to
-- what the bill still needs after its receipts.
--   balance drift per bill = LEAST(tender − same-day receipts, net − all receipts), floor 0
--   paid_amount            = LEAST(net, receipts + LEAST(tender − same-day receipts, current paid))
-- (current paid_amount is the evidence that POS booked the counter money; stale tender on a
-- pay-later bill has paid_amount 0 and is not counted.)
-- SARASWATI JI stays ₹4,300; Mulund-style bills count the payment once.
-- Real receipts above a bill (two receipts for the same money) still count in full, so they stay
-- visible as customer credit and in scripts/find-overpaid-bill-receipts.sql.

-- 1. Part of the counter tender already represented by receipts (or not needed by the bill).
--    drift = GREATEST(0, tender − this).
CREATE OR REPLACE FUNCTION public._sale_counter_tender_settled(
  p_sale_id uuid,
  p_sale_date timestamptz,
  p_tender numeric,
  p_net numeric
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT GREATEST(
    COALESCE(SUM(CASE WHEN public._is_sale_day_receipt(ve.voucher_date, p_sale_date)
                      THEN GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
                      ELSE 0 END), 0),
    COALESCE(p_tender, 0) - GREATEST(0::numeric,
      COALESCE(p_net, 0) - COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))), 0))
  )::numeric
  FROM public.voucher_entries ve
  WHERE ve.reference_id = p_sale_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description);
$$;
COMMENT ON FUNCTION public._sale_counter_tender_settled(uuid, timestamptz, numeric, numeric) IS
  'Counter tender already covered: GREATEST(same-day receipts, tender − (net − all receipts)). '
  'Balance drift = GREATEST(0, tender − this), so a bill is never credited beyond net.';
REVOKE ALL ON FUNCTION public._sale_counter_tender_settled(uuid, timestamptz, numeric, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._sale_counter_tender_settled(uuid, timestamptz, numeric, numeric) TO authenticated, service_role;

-- 2. paid_amount / payment_status reconciler (org guards kept from 20261231120100).
CREATE OR REPLACE FUNCTION public.compute_sale_settlement(p_sale_id uuid, p_org_id uuid)
RETURNS TABLE(new_paid numeric, new_status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_net numeric;
  v_sra numeric;
  v_tender numeric;
  v_sale_date timestamptz;
  v_current_paid numeric;
  v_non_cn numeric;
  v_non_cn_same_day numeric;
  v_cn numeric;
  v_genuine_cn numeric;
  v_receipt_total numeric;
  v_payable_cap numeric;
  v_payment_method text;
  v_settled_for_status numeric;
BEGIN
  -- security review 2026-09-27: organisation guard (kept from 20261231120100)
  PERFORM public._assert_row_org_access('public.sales'::regclass, p_sale_id);
  PERFORM public._assert_org_access(p_org_id);
  SELECT s.net_amount,
         COALESCE(s.sale_return_adjust, 0),
         COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0),
         s.payment_method,
         s.sale_date,
         COALESCE(s.paid_amount, 0)
    INTO v_net, v_sra, v_tender, v_payment_method, v_sale_date, v_current_paid
  FROM public.sales s
  WHERE s.id = p_sale_id
    AND s.organization_id = p_org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold');

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
                      THEN 0
                      ELSE COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0) END), 0),
    COALESCE(SUM(CASE WHEN LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
                      THEN 0
                      WHEN public._is_sale_day_receipt(ve.voucher_date, v_sale_date)
                      THEN COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
                      ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
                      THEN COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
                      ELSE 0 END), 0)
    INTO v_non_cn, v_non_cn_same_day, v_cn
  FROM public.voucher_entries ve
  WHERE ve.reference_id = p_sale_id
    AND ve.voucher_type = 'receipt'
    AND ve.reference_type IN ('sale', 'customer')
    AND ve.organization_id = p_org_id
    AND ve.deleted_at IS NULL;

  -- CN voucher that only audits sale_return_adjust must not inflate paid_amount.
  v_genuine_cn := GREATEST(0, v_cn - v_sra);
  v_receipt_total := v_non_cn + v_genuine_cn;
  v_payable_cap := GREATEST(0, COALESCE(v_net, 0));

  -- Counter tender not already a same-day receipt, but only as far as POS booked it as paid
  -- (stale tender on a pay-later bill has paid_amount 0 and must not count).
  new_paid := LEAST(
    v_payable_cap,
    v_receipt_total + LEAST(
      GREATEST(0, COALESCE(v_tender, 0) - v_non_cn_same_day),
      GREATEST(0, v_current_paid)
    )
  );

  -- Status includes SRA (Adjust CN / Option A). paid_amount stays cash-like only.
  v_settled_for_status := COALESCE(new_paid, 0) + COALESCE(v_sra, 0);
  new_status := public.derive_sale_payment_status(v_payable_cap, v_settled_for_status, v_payment_method);

  RETURN NEXT;
END;
$$;
COMMENT ON FUNCTION public.compute_sale_settlement(uuid, uuid) IS
  'Receipt/tender reconciler for sales.paid_amount: receipts + counter tender not already a '
  'same-day receipt, the tender limited to the current paid_amount (booked at POS), capped at '
  'net. payment_status uses paid + sale_return_adjust vs net.';

-- 3. Set-based party balances (_get_customer_party_balances_rows(uuid, text)) take
--    drift = tender − settled_amt from this helper. Org guard kept from 20261231120100.
CREATE OR REPLACE FUNCTION public._org_sale_receipt_settlement_by_sale(p_organization_id uuid)
RETURNS TABLE (
  sale_id uuid,
  settled_amt numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
-- security review 2026-09-27: organisation guard (kept from 20261231120100)
SELECT public._assert_org_access(p_organization_id);
  SELECT
    s.id AS sale_id,
    GREATEST(
      COALESCE(SUM(CASE WHEN public._is_sale_day_receipt(ve.voucher_date, s.sale_date)
                        THEN GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
                        ELSE 0 END), 0),
      (GREATEST(COALESCE(s.cash_amount, 0), 0) + GREATEST(COALESCE(s.card_amount, 0), 0)
        + GREATEST(COALESCE(s.upi_amount, 0), 0))
      - GREATEST(0::numeric, COALESCE(s.net_amount, 0)
          - COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))), 0))
    )::numeric AS settled_amt
  FROM public.voucher_entries ve
  JOIN public.sales s
    ON s.id = ve.reference_id
   AND s.organization_id = p_organization_id
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.reference_id IS NOT NULL
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
  GROUP BY s.id, s.cash_amount, s.card_amount, s.upi_amount, s.net_amount;
$$;
COMMENT ON FUNCTION public._org_sale_receipt_settlement_by_sale(uuid) IS
  'Per-sale counter tender already covered (see _sale_counter_tender_settled): same-day receipts, '
  'or the part of tender the bill no longer needs after all receipts.';

-- 4. Inline drift subqueries patched by 20261231200000 (reconcile_customer_balance,
--    _get_customer_party_balances_rows(uuid), get_customer_financial_snapshot_all): replace the
--    same-day receipt subquery with the capped helper.
DO $cap_counter_tender$
DECLARE
  r record;
  d text;
  marker constant text := '/* counter-tender capped */';
  pat constant text :=
    'COALESCE\(\(\s*SELECT SUM\(\s*GREATEST\(0::numeric, COALESCE\(ve\.total_amount, 0\) \+ COALESCE\(ve\.discount_amount, 0\)\)\s*\)\s*'
    || 'FROM public\.voucher_entries ve\s*WHERE ve\.organization_id = p_organization_id\s*AND ve\.deleted_at IS NULL\s*'
    || 'AND lower\(COALESCE\(ve\.voucher_type, ''''\)\) = ''receipt''\s*AND ve\.reference_id::text = s\.id::text\s*'
    || 'AND NOT public\._is_settlement_memo_receipt\(ve\.payment_method, ve\.description\)\s*'
    || 'AND public\._is_sale_day_receipt\(ve\.voucher_date, s\.sale_date\) /\* counter-tender same-day \*/\s*\), 0\)';
  repl constant text :=
    'public._sale_counter_tender_settled(s.id, s.sale_date, '
    || 'GREATEST(COALESCE(s.cash_amount, 0), 0) + GREATEST(COALESCE(s.card_amount, 0), 0) + GREATEST(COALESCE(s.upi_amount, 0), 0), '
    || 's.net_amount) ' || '/* counter-tender capped */';
  n int;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public'
      AND p.proname IN (
        'reconcile_customer_balance',
        '_get_customer_party_balances_rows',
        'get_customer_financial_snapshot_all'
      )
  LOOP
    d := pg_get_functiondef(r.oid);
    IF position(marker IN d) > 0 THEN
      RAISE NOTICE '%(%) already capped; skipping', r.proname, r.args;
      CONTINUE;
    END IF;
    n := (SELECT count(*) FROM regexp_matches(d, pat, 'g'));
    IF n = 0 THEN
      RAISE NOTICE '%(%) has no same-day drift subquery; relies on step 3', r.proname, r.args;
      CONTINUE;
    END IF;
    IF n > 1 THEN
      RAISE EXCEPTION '%(%) has % drift subqueries; expected 1 — patch by hand', r.proname, r.args, n;
    END IF;
    EXECUTE regexp_replace(d, pat, repl);
    RAISE NOTICE 'Capped %(%)', r.proname, r.args;
  END LOOP;
END
$cap_counter_tender$;
