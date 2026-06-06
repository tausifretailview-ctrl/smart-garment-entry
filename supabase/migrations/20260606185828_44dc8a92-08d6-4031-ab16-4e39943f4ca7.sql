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
  'Pay-later guard. Counts sale-linked AND customer-keyed receipts (canonical CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES) so legitimate payments are not force-reverted to pending.';