CREATE OR REPLACE FUNCTION public.enforce_pay_later_zero_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_method = 'pay_later' THEN
    IF COALESCE(NEW.paid_amount, 0) <> 0
       OR COALESCE(NEW.cash_amount, 0) <> 0
       OR COALESCE(NEW.card_amount, 0) <> 0
       OR COALESCE(NEW.upi_amount, 0) <> 0
       OR COALESCE(NEW.payment_status, '') NOT IN ('pending', 'hold') THEN
      RAISE WARNING 'enforce_pay_later_zero_paid: corrected sale % (org %) — paid was %, status was %',
        NEW.id, NEW.organization_id, NEW.paid_amount, NEW.payment_status;
    END IF;

    NEW.paid_amount := 0;
    NEW.cash_amount := 0;
    NEW.card_amount := 0;
    NEW.upi_amount := 0;

    -- Keep explicit hold status for on-hold invoices.
    IF COALESCE(NEW.payment_status, '') <> 'hold' THEN
      NEW.payment_status := 'pending';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill legacy hold invoices that were incorrectly forced to "pending".
UPDATE public.sales
SET payment_status = 'hold',
    updated_at = NOW()
WHERE payment_method = 'pay_later'
  AND payment_status = 'pending'
  AND sale_number LIKE 'Hold/%'
  AND deleted_at IS NULL;
