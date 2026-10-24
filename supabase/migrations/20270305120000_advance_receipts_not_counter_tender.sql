-- Advance / gift voucher used on a POS bill must not cancel the cash taken at the counter.
--
-- POS keeps an advance out of the tender columns: on a ₹798 bill with a ₹400 gift voucher,
-- sales.cash_amount = ₹398 and the voucher is an advance_adjustment receipt for ₹400 dated the
-- sale day. compute_sale_settlement (20261231205000) treats every same-day receipt as the
-- counter tender written as a voucher, so the ₹400 receipt cancelled the ₹398 cash:
--   paid = 400 + LEAST(GREATEST(0, 398 − 400), 398) = ₹400 → "partial", ₹398 due
-- (DEMO POS/26-27/398). Advance / credit-note applications are never counter tender; the
-- receipt guard (20261231210000) and the balance drift helper (_sale_counter_tender_settled)
-- already leave them out of the same-day test. This does the same here:
--   paid = 400 + LEAST(GREATEST(0, 398 − 0), 398) = ₹798 → "completed"
-- Bills whose tender columns already hold the full bill are unchanged (capped at net).
--
-- Step 2 recomputes live bills that have an advance_adjustment receipt and are still below
-- their amount, only ever raising paid_amount. Idempotent: re-running is a no-op.

-- 1. paid_amount / payment_status reconciler (org guards kept from 20261231120100).
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
    -- Same-day receipts stand for the counter tender, except advance / CN applications.
    COALESCE(SUM(CASE WHEN LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
                      THEN 0
                      WHEN public._is_settlement_memo_receipt(ve.payment_method, ve.description)
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
  'same-day receipt (advance / CN applications never count as counter tender), the tender '
  'limited to the current paid_amount (booked at POS), capped at net. payment_status uses '
  'paid + sale_return_adjust vs net.';

-- 2. Recompute live bills with an advance / gift voucher that are still below their amount.
DO $advance_not_counter_tender$
DECLARE
  r record;
  v record;
  n int := 0;
BEGIN
  PERFORM set_config('app.settlement_recompute', '1', true);
  FOR r IN
    SELECT DISTINCT s.id, s.organization_id, COALESCE(s.paid_amount, 0) AS paid
    FROM public.sales s
    JOIN public.voucher_entries ve
      ON ve.reference_id = s.id
     AND ve.organization_id = s.organization_id
    WHERE lower(COALESCE(ve.voucher_type, '')) = 'receipt'
      AND lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
      AND ve.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
      AND COALESCE(s.paid_amount, 0) + 0.5 < COALESCE(s.net_amount, 0)
  LOOP
    SELECT * INTO v FROM public.compute_sale_settlement(r.id, r.organization_id);
    IF v.new_paid IS NOT NULL AND v.new_paid > r.paid + 0.009 THEN
      UPDATE public.sales
      SET paid_amount = v.new_paid,
          payment_status = v.new_status
      WHERE id = r.id
        AND organization_id = r.organization_id;
      n := n + 1;
    END IF;
  END LOOP;
  PERFORM set_config('app.settlement_recompute', '0', true);
  RAISE NOTICE 'Advance bills recomputed: %', n;
END
$advance_not_counter_tender$;
