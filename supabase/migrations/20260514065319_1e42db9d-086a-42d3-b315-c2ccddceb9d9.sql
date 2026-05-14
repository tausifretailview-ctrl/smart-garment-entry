-- Heal v2: align sales.paid_amount and payment_status with actual receipt vouchers.
-- Fixes gaps from prior heal: includes pay_later, accepts legacy reference_type='customer'.
WITH receipt_totals AS (
  SELECT
    v.reference_id AS sale_id,
    SUM(COALESCE(v.total_amount, 0) + COALESCE(v.discount_amount, 0))::numeric(14,2) AS receipt_total
  FROM public.voucher_entries v
  WHERE LOWER(COALESCE(v.voucher_type, '')) = 'receipt'
    AND v.reference_id IS NOT NULL
    AND v.deleted_at IS NULL
  GROUP BY v.reference_id
),
healed AS (
  SELECT
    s.id,
    LEAST(
      GREATEST(0, COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0)),
      COALESCE(rt.receipt_total, 0)
    )::numeric(14,2) AS new_paid,
    GREATEST(0, COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0))::numeric(14,2) AS payable
  FROM public.sales s
  JOIN receipt_totals rt ON rt.sale_id = s.id
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.sale_number, '') NOT LIKE 'Hold/%'
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
)
UPDATE public.sales s
SET
  paid_amount = h.new_paid,
  payment_status = CASE
    WHEN h.payable <= 0.01 THEN 'completed'
    WHEN h.new_paid >= h.payable - 0.01 THEN 'completed'
    WHEN h.new_paid > 0.01 THEN 'partial'
    ELSE 'pending'
  END
FROM healed h
WHERE s.id = h.id
  AND (
    ABS(COALESCE(s.paid_amount, 0) - h.new_paid) > 0.01
    OR s.payment_status IS DISTINCT FROM (
      CASE
        WHEN h.payable <= 0.01 THEN 'completed'
        WHEN h.new_paid >= h.payable - 0.01 THEN 'completed'
        WHEN h.new_paid > 0.01 THEN 'partial'
        ELSE 'pending'
      END
    )
  );