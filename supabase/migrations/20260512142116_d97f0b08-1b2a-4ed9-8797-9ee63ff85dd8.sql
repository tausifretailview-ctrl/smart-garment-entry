-- Make pay_later enforcement skip sales that already have receipts posted
CREATE OR REPLACE FUNCTION public.enforce_pay_later_zero_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_has_receipts boolean;
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
      -- A real receipt exists; let paid_amount / payment_status reflect reality.
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

-- Re-run KS Footwear backfill now that the pay_later block is lifted for receipted sales
WITH receipt_sums AS (
  SELECT
    ve.reference_id AS sale_id,
    SUM(COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)) AS receipt_total
  FROM public.voucher_entries ve
  WHERE ve.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
    AND ve.voucher_type = 'receipt'
    AND ve.reference_type = 'sale'
    AND ve.reference_id IS NOT NULL
  GROUP BY ve.reference_id
),
recomputed AS (
  SELECT
    s.id,
    s.net_amount,
    LEAST(
      GREATEST(0, COALESCE(s.net_amount,0) - COALESCE(s.sale_return_adjust,0)),
      COALESCE(rs.receipt_total, 0)
    ) AS new_paid,
    COALESCE(s.sale_return_adjust, 0) AS sra
  FROM public.sales s
  JOIN receipt_sums rs ON rs.sale_id = s.id
  WHERE s.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
)
UPDATE public.sales s
SET
  paid_amount = r.new_paid,
  payment_status = CASE
    WHEN (r.new_paid + r.sra) >= (COALESCE(r.net_amount,0) - 1) AND r.new_paid > 0 THEN 'completed'
    WHEN r.new_paid > 0 THEN 'partial'
    ELSE 'pending'
  END
FROM recomputed r
WHERE s.id = r.id
  AND s.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c';