-- SQL file 50: a bill's paid amount can never be more than its receipts + counter payment.
--
-- Over 40 screens / helpers write sales.paid_amount from their own arithmetic. When a later
-- payment or an advance lands on a POS bill, the app turns the counter (at-sale) payment into a
-- receipt "Counter payment received for sale …" — the same money. A screen that then adds the
-- counter payment AND that receipt overstated paid and understated the customer's balance:
--   SM HAIR POS/26-27/1500   paid 14,000 for 6,000 at the counter + 2,000 later
--   VASTRAKALA POS/26-27/803 paid 4,700 for 2,350 at the counter + 2,000 advance
--   Gurukrupa POS/26-27/1984 paid 9,300 for 5,000 + 2,000 (and two more)
-- The receipt trigger (compute_sale_settlement) only runs when a receipt changes, so a later
-- client write was never checked.
--
-- 1. BEFORE UPDATE on sales, for a live bill that has at least one live receipt: paid_amount is
--    capped at   net  and   receipts + counter payment not already a same-day receipt
--    (receipts = every receipt except credit-note applications, plus credit notes above the
--    bill's own S/R adjust; counter payment = cash + card + UPI + finance on the bill; same-day
--    receipts that are advance / CN applications do not cancel counter payment).
--    This is the compute_sale_settlement rule without its "tender only as far as already
--    booked" limit, so it is never lower than that rule: it only stops an overstatement.
--    It never raises paid and never touches a bill with no receipt (paid at the counter only).
-- 2. Bills that are above that cap now are brought down to it (preview: file 49).
-- One transaction. Running it again changes nothing.

-- The cap for one bill; NULL when the bill has no live receipt (nothing to check).
CREATE OR REPLACE FUNCTION public._sale_paid_cap(
  p_sale_id uuid, p_org_id uuid, p_net numeric, p_sra numeric, p_tender numeric, p_sale_date timestamptz
)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_count int;
  v_non_cn numeric;
  v_same_day numeric;
  v_cn numeric;
BEGIN
  SELECT count(*),
         COALESCE(SUM(CASE WHEN lower(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment' THEN 0
                           ELSE COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0) END), 0),
         COALESCE(SUM(CASE WHEN lower(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment' THEN 0
                           WHEN public._is_settlement_memo_receipt(ve.payment_method, ve.description) THEN 0
                           WHEN public._is_sale_day_receipt(ve.voucher_date, p_sale_date)
                             THEN COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
                           ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN lower(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
                           THEN COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0) ELSE 0 END), 0)
    INTO v_count, v_non_cn, v_same_day, v_cn
  FROM public.voucher_entries ve
  WHERE ve.reference_id = p_sale_id
    AND ve.organization_id = p_org_id
    AND ve.voucher_type = 'receipt'
    AND ve.reference_type IN ('sale', 'customer')
    AND ve.deleted_at IS NULL;

  IF v_count = 0 THEN
    RETURN NULL;
  END IF;
  RETURN round(LEAST(GREATEST(0, COALESCE(p_net, 0)),
                     v_non_cn + GREATEST(0, v_cn - COALESCE(p_sra, 0))
                       + GREATEST(0, COALESCE(p_tender, 0) - v_same_day)), 2);
END;
$function$;

-- Only the trigger and the backfill call it: not callable by app users (no shop check needed).
REVOKE ALL ON FUNCTION public._sale_paid_cap(uuid, uuid, numeric, numeric, numeric, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cap_sale_paid_to_receipts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_cap numeric;
BEGIN
  IF NEW.deleted_at IS NOT NULL
     OR COALESCE(NEW.is_cancelled, false)
     OR COALESCE(NEW.payment_status, '') IN ('cancelled', 'hold')
     OR COALESCE(NEW.paid_amount, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  v_cap := public._sale_paid_cap(
    NEW.id, NEW.organization_id, NEW.net_amount, NEW.sale_return_adjust,
    COALESCE(NEW.cash_amount, 0) + COALESCE(NEW.card_amount, 0)
      + COALESCE(NEW.upi_amount, 0) + COALESCE(NEW.finance_amount, 0),
    NEW.sale_date);

  IF v_cap IS NOT NULL AND COALESCE(NEW.paid_amount, 0) > v_cap + 0.5 THEN
    NEW.paid_amount := v_cap;
  END IF;
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.cap_sale_paid_to_receipts() IS
  'BEFORE UPDATE on sales: a live bill with receipts never has paid_amount above net or above '
  'receipts + counter payment (cash/card/UPI/finance) not already a same-day receipt. Stops a '
  'screen counting the counter payment twice; never raises paid.';

REVOKE ALL ON FUNCTION public.cap_sale_paid_to_receipts() FROM PUBLIC, anon;

-- Runs before trg_enforce_pay_later_zero_paid and trg_normalize_sale_payment_status_on_write
-- (triggers fire in name order), so the payment status is derived from the capped amount.
DROP TRIGGER IF EXISTS trg_cap_sale_paid_to_receipts ON public.sales;
CREATE TRIGGER trg_cap_sale_paid_to_receipts
  BEFORE UPDATE OF paid_amount, cash_amount, card_amount, upi_amount, net_amount, sale_return_adjust
  ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.cap_sale_paid_to_receipts();

-- 2. Only the bills above the cap now are changed (to the cap); the status follows.
DO $backfill$
DECLARE
  n int;
BEGIN
  WITH over AS (
    SELECT s.id, c.cap
    FROM public.sales s
    CROSS JOIN LATERAL (SELECT public._sale_paid_cap(
        s.id, s.organization_id, s.net_amount, s.sale_return_adjust,
        COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0)
          + COALESCE(s.upi_amount, 0) + COALESCE(s.finance_amount, 0),
        s.sale_date) AS cap) c
    WHERE s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
      AND COALESCE(s.paid_amount, 0) > 0
      AND EXISTS (SELECT 1 FROM public.voucher_entries ve
                  WHERE ve.reference_id = s.id AND ve.organization_id = s.organization_id
                    AND ve.voucher_type = 'receipt' AND ve.deleted_at IS NULL)
  )
  UPDATE public.sales s
     SET paid_amount = o.cap
    FROM over o
   WHERE s.id = o.id AND o.cap IS NOT NULL AND s.paid_amount > o.cap + 0.5;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE 'Bills brought down to their receipts: %', n;
END
$backfill$;
