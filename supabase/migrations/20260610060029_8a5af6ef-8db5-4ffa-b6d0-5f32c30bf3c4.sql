CREATE OR REPLACE FUNCTION public.compute_sale_settlement(p_sale_id uuid, p_org_id uuid)
 RETURNS TABLE(new_paid numeric, new_status text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_net numeric;
  v_sra numeric;
  v_tender numeric;
  v_non_cn numeric;
  v_cn numeric;
  v_genuine_cn numeric;
  v_receipt_total numeric;
  v_payable_cap numeric;
  v_payment_method text;
BEGIN
  SELECT s.net_amount,
         COALESCE(s.sale_return_adjust, 0),
         COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0),
         COALESCE(s.payment_method, '')
    INTO v_net, v_sra, v_tender, v_payment_method
  FROM public.sales s
  WHERE s.id = p_sale_id
    AND s.organization_id = p_org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold');

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
                      THEN 0
                      ELSE COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0) END), 0),
    COALESCE(SUM(CASE WHEN LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
                      THEN COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
                      ELSE 0 END), 0)
    INTO v_non_cn, v_cn
  FROM public.voucher_entries ve
  WHERE ve.reference_id = p_sale_id
    AND ve.voucher_type = 'receipt'
    AND LOWER(COALESCE(ve.reference_type, '')) IN ('sale', 'customer', 'customerreceipt')
    AND ve.organization_id = p_org_id
    AND ve.deleted_at IS NULL;

  v_genuine_cn := GREATEST(0, v_cn - v_sra);
  v_receipt_total := v_non_cn + v_genuine_cn;

  v_payable_cap := GREATEST(0, COALESCE(v_net, 0));

  IF COALESCE(v_tender, 0) > v_receipt_total + 0.0001 THEN
    new_paid := LEAST(v_payable_cap, GREATEST(v_receipt_total, v_tender));
  ELSE
    new_paid := LEAST(v_payable_cap, v_receipt_total + GREATEST(0, COALESCE(v_tender, 0)));
  END IF;

  IF v_payment_method = 'pay_later'
     AND COALESCE(new_paid, 0) <= 0.5
     AND COALESCE(v_sra, 0) <= 0.5 THEN
    new_status := 'pending';
    RETURN NEXT;
    RETURN;
  END IF;

  IF v_payable_cap <= 0.5 THEN
    new_status := 'completed';
  ELSIF new_paid >= v_payable_cap - 0.5 THEN
    new_status := 'completed';
  ELSIF new_paid > 0.5 OR v_sra > 0.5 THEN
    new_status := 'partial';
  ELSE
    new_status := 'pending';
  END IF;

  RETURN NEXT;
END;
$function$;

-- Re-sync all active sales using the corrected calculator.
WITH recompute AS (
  SELECT s.id,
         s.organization_id,
         s.paid_amount AS old_paid,
         s.payment_status AS old_status,
         c.new_paid,
         c.new_status
  FROM public.sales s
  CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) c
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
    AND c.new_paid IS NOT NULL
)
UPDATE public.sales s
SET paid_amount = r.new_paid,
    payment_status = r.new_status
FROM recompute r
WHERE s.id = r.id
  AND (
    ABS(COALESCE(s.paid_amount, 0) - r.new_paid) > 0.01
    OR COALESCE(s.payment_status, '') <> r.new_status
  );