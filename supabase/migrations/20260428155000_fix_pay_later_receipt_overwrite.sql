CREATE OR REPLACE FUNCTION public.enforce_pay_later_zero_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_method = 'pay_later' THEN
    -- On INSERT, pay_later invoices should start unpaid (except explicit hold status).
    IF TG_OP = 'INSERT' THEN
      NEW.paid_amount := 0;
      NEW.cash_amount := 0;
      NEW.card_amount := 0;
      NEW.upi_amount := 0;

      IF COALESCE(NEW.payment_status, '') <> 'hold' THEN
        NEW.payment_status := 'pending';
      END IF;
    ELSE
      -- On UPDATE, do NOT wipe amounts for partially/fully paid invoices.
      -- Only enforce zero amounts when invoice is explicitly being kept in unpaid states.
      IF COALESCE(NEW.payment_status, '') IN ('pending', 'hold') THEN
        NEW.paid_amount := 0;
        NEW.cash_amount := 0;
        NEW.card_amount := 0;
        NEW.upi_amount := 0;

        IF COALESCE(NEW.payment_status, '') <> 'hold' THEN
          NEW.payment_status := 'pending';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: restore paid_amount/payment_status for credit invoices from non-deleted receipts.
WITH receipt_totals AS (
  SELECT
    v.reference_id AS sale_id,
    SUM(COALESCE(v.total_amount, 0))::numeric AS total_paid,
    MAX(v.voucher_date) AS last_payment_date
  FROM public.voucher_entries v
  WHERE LOWER(COALESCE(v.voucher_type, '')) = 'receipt'
    AND v.reference_type = 'sale'
    AND v.reference_id IS NOT NULL
    AND v.deleted_at IS NULL
  GROUP BY v.reference_id
)
UPDATE public.sales s
SET
  paid_amount = rt.total_paid,
  payment_status = CASE
    WHEN rt.total_paid >= COALESCE(s.net_amount, 0) THEN 'completed'
    WHEN rt.total_paid > 0 THEN 'partial'
    ELSE 'pending'
  END,
  payment_date = COALESCE(rt.last_payment_date, s.payment_date),
  updated_at = NOW()
FROM receipt_totals rt
WHERE s.id = rt.sale_id
  AND s.payment_method = 'pay_later'
  AND s.deleted_at IS NULL
  AND COALESCE(s.sale_number, '') NOT LIKE 'Hold/%';
