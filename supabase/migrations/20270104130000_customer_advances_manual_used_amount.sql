-- customer_advances.used_amount was rebuilt from advance-application vouchers alone
-- (recompute_customer_advances_used, 20260511201251). Two kinds of used_amount have no
-- voucher behind them and were wiped the next time any advance voucher changed:
--   * Balance Adjustment "advance reduced" (Saniya Mahaldar, ELLA NOOR: -40,000 at 11:46,
--     advance applied to a bill at 11:48 -> used back to 19,600, 40,000 available again)
--   * advance refunds (advance_refunds row + used bump) - 67 ELLA NOOR customers show a
--     refunded advance as available again
--
-- 1) manual_used_amount: the part of used_amount that is a Balance Adjustment deduction.
--    The app writes it (deductCustomerAdvanceManually); recompute keeps it.
-- 2) recompute: per booking, fixed = LEAST(amount, manual_used_amount + refunds of that
--    booking); advance-application vouchers then fill the rest of the booking, oldest first.
--
-- No existing data is changed by this migration. Customers already wiped are repaired with
-- a separate reviewed script (refunds are exact; manual deductions need the shop's check).

ALTER TABLE public.customer_advances
  ADD COLUMN IF NOT EXISTS manual_used_amount numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.customer_advances.manual_used_amount IS
  'Part of used_amount removed by a Balance Adjustment (no voucher). Kept by recompute_customer_advances_used.';

CREATE OR REPLACE FUNCTION public.recompute_customer_advances_used(
  p_organization_id uuid,
  p_customer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_used numeric := 0;
  v_remaining  numeric;
  rec          RECORD;
  v_fixed      numeric;
  v_take       numeric;
  v_use        numeric;
  v_status     text;
BEGIN
  IF p_organization_id IS NULL OR p_customer_id IS NULL THEN
    RETURN;
  END IF;

  -- Sum of advance-funded receipts for this customer (unchanged from 20260511201251):
  -- 1) sale-linked receipts where the linked sale belongs to this customer
  -- 2) opening-balance/advance receipts directly keyed to this customer
  SELECT COALESCE(SUM(ve.total_amount), 0) INTO v_total_used
  FROM public.voucher_entries ve
  LEFT JOIN public.sales s ON s.id = ve.reference_id
  WHERE ve.organization_id = p_organization_id
    AND ve.voucher_type = 'receipt'
    AND ve.deleted_at IS NULL
    AND (
      ve.payment_method = 'advance_adjustment'
      OR ve.description ILIKE '%adjusted from advance balance%'
    )
    AND (
      s.customer_id = p_customer_id
      OR (s.id IS NULL AND ve.reference_type = 'customer' AND ve.reference_id = p_customer_id)
    );

  v_remaining := v_total_used;

  FOR rec IN
    SELECT ca.id,
           COALESCE(ca.amount, 0) AS amount,
           COALESCE(ca.manual_used_amount, 0) AS manual_used,
           COALESCE((
             SELECT SUM(ar.refund_amount)
             FROM public.advance_refunds ar
             WHERE ar.advance_id = ca.id
           ), 0) AS refunded
    FROM public.customer_advances ca
    WHERE ca.organization_id = p_organization_id
      AND ca.customer_id = p_customer_id
    ORDER BY ca.advance_date ASC NULLS LAST, ca.created_at ASC NULLS LAST, ca.id ASC
  LOOP
    v_fixed := LEAST(rec.amount, rec.manual_used + rec.refunded);
    v_take  := LEAST(GREATEST(v_remaining, 0), rec.amount - v_fixed);
    v_use   := v_fixed + v_take;
    v_status := CASE
      WHEN v_use >= rec.amount AND rec.amount > 0 THEN 'used'
      WHEN v_use > 0 THEN 'partially_used'
      ELSE 'active'
    END;

    UPDATE public.customer_advances
       SET used_amount = v_use,
           status = v_status
     WHERE id = rec.id
       AND (used_amount IS DISTINCT FROM v_use OR status IS DISTINCT FROM v_status);

    v_remaining := v_remaining - v_take;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.recompute_customer_advances_used(uuid, uuid) IS
  'used_amount per booking = LEAST(amount, manual_used_amount + refunds) + advance-application vouchers (oldest booking first).';
