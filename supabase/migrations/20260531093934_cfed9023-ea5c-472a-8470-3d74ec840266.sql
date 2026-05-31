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
        AND LOWER(COALESCE(ve.voucher_type,'')) = 'receipt'
        AND ve.reference_type IN ('sale','SALE','CustomerReceipt')
        AND ve.organization_id = NEW.organization_id
        AND ve.deleted_at IS NULL
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

-- Re-run backfill now that the trigger no longer blocks the update.
WITH receipt_totals AS (
  SELECT v.organization_id, v.reference_id AS sale_id,
         SUM(COALESCE(v.total_amount,0))::numeric(14,2) AS rcpt_total
  FROM public.voucher_entries v
  WHERE LOWER(COALESCE(v.voucher_type,''))='receipt'
    AND v.reference_type IN ('sale','SALE','CustomerReceipt')
    AND v.reference_id IS NOT NULL AND v.deleted_at IS NULL
  GROUP BY 1,2
),
target AS (
  SELECT s.id, s.net_amount, COALESCE(s.sale_return_adjust,0) AS sra,
         LEAST(GREATEST(rt.rcpt_total,0),
               GREATEST(s.net_amount - COALESCE(s.sale_return_adjust,0), 0))::numeric(14,2) AS new_paid
  FROM public.sales s
  JOIN receipt_totals rt ON rt.sale_id=s.id AND rt.organization_id=s.organization_id
  WHERE s.deleted_at IS NULL
    AND ABS(rt.rcpt_total - COALESCE(s.paid_amount,0)) > 0.01
)
UPDATE public.sales s
SET paid_amount = t.new_paid,
    payment_status = CASE
      WHEN t.new_paid + t.sra >= t.net_amount - 0.01 THEN 'completed'
      WHEN t.new_paid > 0.01 OR t.sra > 0.01 THEN 'partial'
      ELSE 'pending'
    END
FROM target t
WHERE s.id = t.id;