-- Backfill sales.paid_amount and payment_status from receipt vouchers (including reference_type='CustomerReceipt')
WITH receipt_totals AS (
  SELECT v.organization_id,
         v.reference_id AS sale_id,
         SUM(COALESCE(v.total_amount,0))::numeric(14,2) AS rcpt_total
  FROM public.voucher_entries v
  WHERE LOWER(COALESCE(v.voucher_type,''))='receipt'
    AND v.reference_type IN ('sale','SALE','CustomerReceipt')
    AND v.reference_id IS NOT NULL
    AND v.deleted_at IS NULL
  GROUP BY v.organization_id, v.reference_id
),
target AS (
  SELECT s.id,
         s.net_amount,
         COALESCE(s.sale_return_adjust,0) AS sra,
         LEAST(
           GREATEST(rt.rcpt_total, 0),
           GREATEST(s.net_amount - COALESCE(s.sale_return_adjust,0), 0)
         )::numeric(14,2) AS new_paid
  FROM public.sales s
  JOIN receipt_totals rt
    ON rt.sale_id = s.id AND rt.organization_id = s.organization_id
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