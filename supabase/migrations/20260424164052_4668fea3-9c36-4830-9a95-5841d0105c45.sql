CREATE OR REPLACE FUNCTION public.enforce_pay_later_zero_paid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.payment_method = 'pay_later' THEN
    IF COALESCE(NEW.paid_amount,0) <> 0
       OR COALESCE(NEW.cash_amount,0) <> 0
       OR COALESCE(NEW.card_amount,0) <> 0
       OR COALESCE(NEW.upi_amount,0) <> 0
       OR COALESCE(NEW.payment_status,'') <> 'pending' THEN
      RAISE WARNING 'enforce_pay_later_zero_paid: corrected sale % (org %) — paid was %, status was %',
        NEW.id, NEW.organization_id, NEW.paid_amount, NEW.payment_status;
    END IF;
    NEW.paid_amount := 0;
    NEW.cash_amount := 0;
    NEW.card_amount := 0;
    NEW.upi_amount := 0;
    NEW.payment_status := 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pay_later_zero_paid ON public.sales;
CREATE TRIGGER trg_enforce_pay_later_zero_paid
BEFORE INSERT OR UPDATE OF payment_method, paid_amount, cash_amount, card_amount, upi_amount, payment_status
ON public.sales
FOR EACH ROW
EXECUTE FUNCTION public.enforce_pay_later_zero_paid();