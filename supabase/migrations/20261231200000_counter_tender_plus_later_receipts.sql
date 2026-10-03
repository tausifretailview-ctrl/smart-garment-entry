-- Counter (at-sale) payment + later receipts on the same POS bill: count BOTH.
--
-- Before: every place that combined sales.cash/card/upi ("counter tender") with receipt
-- vouchers on the same bill used max(tender, receipts):
--   * compute_sale_settlement      → sales.paid_amount / payment_status (receipt trigger)
--   * paid_at_sale_drift term in reconcile_customer_balance, _get_customer_party_balances_rows,
--     get_customer_financial_snapshot_all (Settle dialog, Payments picker badge, snapshots)
-- so a ₹1,100 counter payment plus a ₹4,300 receipt for the rest of a ₹5,400 bill counted as
-- ₹4,300 paid. Gurukrupa SARASWATI JI showed Outstanding ₹9,650 there while the bills, the POS
-- Dashboard and the Customer Ledger agreed on ₹4,300 (after removing two wrong receipts).
--
-- Rule now (same as the Customer Ledger, src/utils/customerLedgerTransactions.ts):
--   receipts dated the SAME DAY as the sale (UTC date of sale_date, or its India date) are the
--   counter payment written as a voucher (dual-written POS bills, "Counter payment received for
--   sale …" backfills) and only cancel that much tender; receipts on later days add on top.
--   paid = LEAST(net, all receipts + GREATEST(0, tender − same-day receipts))
-- When every receipt is same-day this equals the old max(tender, receipts), so dual-written
-- bills do not change.
--
-- Function bodies that may have diverged live are patched in place (pg_get_functiondef +
-- regexp_replace), the same way 20261225120000 did. Idempotent: re-running is a no-op.

-- 1. Same-day test shared by every caller.
CREATE OR REPLACE FUNCTION public._is_sale_day_receipt(p_voucher_date date, p_sale_date timestamptz)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT p_voucher_date IS NULL
      OR p_sale_date IS NULL
      OR p_voucher_date = (p_sale_date AT TIME ZONE 'UTC')::date
      OR p_voucher_date = (p_sale_date AT TIME ZONE 'Asia/Kolkata')::date;
$$;
COMMENT ON FUNCTION public._is_sale_day_receipt(date, timestamptz) IS
  'True when a receipt is dated on the sale''s own day (UTC or India date). Such receipts represent '
  'the counter tender already in sales.cash/card/upi; later receipts are additional payments.';
GRANT EXECUTE ON FUNCTION public._is_sale_day_receipt(date, timestamptz) TO authenticated, service_role;

-- 2. paid_amount / payment_status reconciler.
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
  v_non_cn numeric;
  v_non_cn_same_day numeric;
  v_cn numeric;
  v_genuine_cn numeric;
  v_receipt_total numeric;
  v_payable_cap numeric;
  v_payment_method text;
  v_settled_for_status numeric;
BEGIN
  SELECT s.net_amount,
         COALESCE(s.sale_return_adjust, 0),
         COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0),
         s.payment_method,
         s.sale_date
    INTO v_net, v_sra, v_tender, v_payment_method, v_sale_date
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

  -- Counter tender not already written as a same-day receipt, plus every receipt.
  new_paid := LEAST(
    v_payable_cap,
    v_receipt_total + GREATEST(0, COALESCE(v_tender, 0) - v_non_cn_same_day)
  );

  -- Status includes SRA (Adjust CN / Option A). paid_amount stays cash-like only.
  v_settled_for_status := COALESCE(new_paid, 0) + COALESCE(v_sra, 0);
  new_status := public.derive_sale_payment_status(v_payable_cap, v_settled_for_status, v_payment_method);

  RETURN NEXT;
END;
$$;
COMMENT ON FUNCTION public.compute_sale_settlement(uuid, uuid) IS
  'Receipt/tender reconciler for sales.paid_amount: all receipts + counter tender not already a '
  'same-day receipt (_is_sale_day_receipt), capped at net. payment_status uses paid + '
  'sale_return_adjust vs net. CN vouchers that duplicate SRA are not added to paid.';

-- 3. Per-sale receipts that represent the counter tender (used by the drift term of the
--    set-based party balances). Was: all receipts on the sale.
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
  SELECT
    ve.reference_id AS sale_id,
    COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ), 0)::numeric AS settled_amt
  FROM public.voucher_entries ve
  JOIN public.sales s
    ON s.id = ve.reference_id
   AND s.organization_id = p_organization_id
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.reference_id IS NOT NULL
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
    AND public._is_sale_day_receipt(ve.voucher_date, s.sale_date)
  GROUP BY ve.reference_id;
$$;
COMMENT ON FUNCTION public._org_sale_receipt_settlement_by_sale(uuid) IS
  'Per-sale SAME-DAY receipt totals (memo-excluded): the part of the counter tender already '
  'written as a voucher. Later receipts are counted separately in receipt_payments.';

-- 4. Inline drift subqueries (reconcile_customer_balance, _get_customer_party_balances_rows,
--    get_customer_financial_snapshot_all): only same-day receipts cancel counter tender.
DO $counter_tender_same_day$
DECLARE
  r record;
  d text;
  patched text;
  marker constant text := '/* counter-tender same-day */';
  pat constant text :=
    '(ve\.reference_id::text = s\.id::text\s+AND NOT public\._is_settlement_memo_receipt\(ve\.payment_method, ve\.description\))';
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'reconcile_customer_balance',
        '_get_customer_party_balances_rows',
        'get_customer_financial_snapshot_all'
      )
  LOOP
    d := pg_get_functiondef(r.oid);
    IF position(marker IN d) > 0 THEN
      RAISE NOTICE '%(%) already patched; skipping', r.proname, r.args;
      CONTINUE;
    END IF;
    IF d !~ pat THEN
      -- Set-based bodies that use _org_sale_receipt_settlement_by_sale are fixed by step 3.
      RAISE NOTICE '%(%) has no inline drift receipt subquery; relies on step 3', r.proname, r.args;
      CONTINUE;
    END IF;
    patched := regexp_replace(
      d,
      pat,
      E'\\1\n          AND public._is_sale_day_receipt(ve.voucher_date, s.sale_date) ' || marker,
      'g'
    );
    EXECUTE patched;
    RAISE NOTICE 'Patched %(%)', r.proname, r.args;
  END LOOP;
END
$counter_tender_same_day$;
