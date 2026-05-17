CREATE OR REPLACE FUNCTION public.enforce_pay_later_zero_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_has_receipts boolean;
  v_adjust_total numeric;
BEGIN
  IF NEW.payment_method = 'pay_later' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.voucher_entries ve
      WHERE ve.reference_id = NEW.id
        AND ve.voucher_type = 'receipt'
        AND ve.reference_type = 'sale'
        AND ve.organization_id = NEW.organization_id
    ) INTO v_has_receipts;

    IF v_has_receipts THEN
      RETURN NEW;
    END IF;

    -- Allow non-receipt settlements via credit notes / sale-return adjust
    v_adjust_total := COALESCE(NEW.sale_return_adjust,0) + COALESCE(NEW.credit_applied,0);
    IF v_adjust_total >= COALESCE(NEW.net_amount,0) - 0.5 AND COALESCE(NEW.net_amount,0) > 0 THEN
      -- Fully settled via adjustments; keep paid_amount at 0 (real cash is zero)
      -- but allow payment_status to reflect settlement.
      NEW.cash_amount := 0;
      NEW.card_amount := 0;
      NEW.upi_amount := 0;
      NEW.paid_amount := 0;
      IF COALESCE(NEW.payment_status,'') NOT IN ('completed','cancelled','hold') THEN
        NEW.payment_status := 'completed';
      END IF;
      RETURN NEW;
    END IF;

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
$function$;