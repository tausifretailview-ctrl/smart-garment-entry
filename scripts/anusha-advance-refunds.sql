-- Phase 0 — Anusha Pathan advance_refunds forensic
-- Customer: 4751fce3-6453-49c1-bd16-e11ea2a67ee2

-- 1) All advances for this customer
SELECT
  id,
  advance_number,
  amount,
  used_amount,
  amount - used_amount AS remaining_booking,
  status,
  advance_date,
  deleted_at
FROM public.customer_advances
WHERE customer_id = '4751fce3-6453-49c1-bd16-e11ea2a67ee2'
ORDER BY advance_date, created_at;

-- 2) All advance_refunds linked to those advances
SELECT
  ar.id,
  ar.advance_id,
  ca.advance_number,
  ar.refund_amount,
  ar.refund_date,
  ar.payment_method,
  ar.reason,
  ar.refund_number,
  ar.voucher_entry_id,
  ar.created_at,
  ar.organization_id
FROM public.advance_refunds ar
JOIN public.customer_advances ca ON ca.id = ar.advance_id
WHERE ca.customer_id = '4751fce3-6453-49c1-bd16-e11ea2a67ee2'
ORDER BY ar.refund_date, ar.created_at;

-- 3) Sum check vs unused
SELECT
  COALESCE(SUM(ca.amount), 0) AS advance_total,
  COALESCE(SUM(ca.used_amount), 0) AS used_total,
  COALESCE(SUM(ar.refund_amount), 0) AS refund_total,
  COALESCE(SUM(ca.amount), 0)
    - COALESCE(SUM(ca.used_amount), 0)
    - COALESCE((
        SELECT SUM(ar2.refund_amount)
        FROM public.advance_refunds ar2
        WHERE ar2.advance_id = ANY (ARRAY_AGG(ca.id))
      ), 0) AS unused_if_refunds_subtracted
FROM public.customer_advances ca
LEFT JOIN public.advance_refunds ar ON ar.advance_id = ca.id
WHERE ca.customer_id = '4751fce3-6453-49c1-bd16-e11ea2a67ee2';
