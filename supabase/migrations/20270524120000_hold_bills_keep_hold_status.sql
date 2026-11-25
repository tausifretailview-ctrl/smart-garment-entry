-- SQL file 30: held POS bills (F7 Hold) are saved as "pending" instead of "hold".
--
-- The pay-later guard enforce_pay_later_zero_paid() was rewritten in May/June 2026
-- (20260512…, 20260517…, 20260531…, 20260606…) and the last version forces every pay_later
-- bill to "pending", dropping the "keep hold" exception added on 28 Apr 2026
-- (20260428131500_fix_hold_status_pay_later_trigger). F7 Hold saves pay_later + "hold", so every
-- bill parked since then is stored as an unpaid credit bill. The POS still shows it as HOLD
-- (Hold/ number), but anything that checks the status (customer outstanding, ledgers,
-- balance reports) counts the parked cart as money the customer owes.
--
-- 1. Same function as 20260606185828, plus: a "hold" bill keeps its status (its paid fields are
--    still zeroed).
-- 2. Bills that are still parked carts — Hold/ number, pay_later, "pending", the cart in
--    held_cart_data and no bill lines — go back to "hold". Hold/ bills that were completed on
--    credit have bill lines and stay "pending".
-- One transaction. Running it again changes nothing.

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
    -- Held cart (F7 Hold): not a credit bill yet. Keep "hold"; nothing is paid on it.
    IF COALESCE(NEW.payment_status, '') = 'hold' THEN
      NEW.paid_amount := 0;
      NEW.cash_amount := 0;
      NEW.card_amount := 0;
      NEW.upi_amount := 0;
      RETURN NEW;
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.voucher_entries ve
      WHERE ve.organization_id = NEW.organization_id
        AND ve.deleted_at IS NULL
        AND LOWER(COALESCE(ve.voucher_type,'')) = 'receipt'
        AND ve.reference_type IN (
              'sale','SALE','customer','customer_payment','CustomerReceipt'
            )
        AND (
          (ve.reference_type IN ('sale','SALE','CustomerReceipt')
             AND ve.reference_id = NEW.id)
          OR
          (ve.reference_type IN ('customer','customer_payment') AND (
              ve.reference_id = NEW.id
              OR (
                ve.reference_id = NEW.customer_id
                AND NEW.sale_number IS NOT NULL
                AND POSITION(UPPER(NEW.sale_number) IN UPPER(COALESCE(ve.description,''))) > 0
              )
          ))
        )
    ) INTO v_has_receipts;

    IF v_has_receipts THEN
      RETURN NEW;
    END IF;

    v_adjust_total := COALESCE(NEW.sale_return_adjust,0) + COALESCE(NEW.credit_applied,0);
    IF v_adjust_total >= COALESCE(NEW.net_amount,0) - 0.5 AND COALESCE(NEW.net_amount,0) > 0 THEN
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

COMMENT ON FUNCTION public.enforce_pay_later_zero_paid() IS
  'Pay-later guard. Held carts (status hold) keep hold with zero paid. Counts sale-linked AND customer-keyed receipts (canonical CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES) so legitimate payments are not force-reverted to pending.';

-- Parked carts saved as "pending" go back to "hold".
UPDATE public.sales s
SET payment_status = 'hold',
    updated_at = now()
WHERE s.sale_number LIKE 'Hold/%'
  AND s.payment_method = 'pay_later'
  AND s.payment_status = 'pending'
  AND s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND s.held_cart_data IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.sale_items si
    WHERE si.sale_id = s.id AND si.deleted_at IS NULL
  );
