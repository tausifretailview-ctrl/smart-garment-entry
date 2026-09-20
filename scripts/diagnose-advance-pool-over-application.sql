-- Advance pool vs live advance_adjustment vouchers (no helper functions required).
-- Change slug below or replace org CTE with a fixed organization id.

WITH org AS (
  SELECT id FROM public.organizations WHERE slug = 'ella-noor' LIMIT 1
),
booked AS (
  SELECT ca.customer_id, ca.organization_id, COALESCE(SUM(ca.amount), 0) AS sum_booked
  FROM public.customer_advances ca
  INNER JOIN org o ON o.id = ca.organization_id
  GROUP BY ca.customer_id, ca.organization_id
),
refunded AS (
  SELECT ca.customer_id, ca.organization_id, COALESCE(SUM(ar.refund_amount), 0) AS sum_refunded
  FROM public.advance_refunds ar
  INNER JOIN public.customer_advances ca ON ca.id = ar.advance_id
  INNER JOIN org o ON o.id = ca.organization_id
  GROUP BY ca.customer_id, ca.organization_id
),
applied AS (
  SELECT
    COALESCE(s.customer_id, ve.reference_id) AS customer_id,
    ve.organization_id,
    COALESCE(SUM(ve.total_amount), 0) AS applied_vouchers
  FROM public.voucher_entries ve
  INNER JOIN org o ON o.id = ve.organization_id
  LEFT JOIN public.sales s
    ON s.id = ve.reference_id
   AND s.organization_id = ve.organization_id
   AND s.deleted_at IS NULL
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND (
      lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
      OR COALESCE(ve.description, '') ILIKE '%adjusted from advance balance%'
    )
    AND (
      (s.id IS NOT NULL AND s.customer_id IS NOT NULL)
      OR (
        s.id IS NULL
        AND lower(COALESCE(ve.reference_type, '')) = 'customer'
        AND ve.reference_id IS NOT NULL
      )
    )
  GROUP BY 1, 2
),
used AS (
  SELECT ca.customer_id, ca.organization_id, COALESCE(SUM(ca.used_amount), 0) AS sum_used_amount
  FROM public.customer_advances ca
  INNER JOIN org o ON o.id = ca.organization_id
  GROUP BY ca.customer_id, ca.organization_id
),
per_customer AS (
  SELECT
    c.id AS customer_id,
    c.customer_name,
    COALESCE(b.sum_booked, 0) - COALESCE(r.sum_refunded, 0) AS pool_cap,
    COALESCE(a.applied_vouchers, 0) AS applied_vouchers,
    COALESCE(u.sum_used_amount, 0) AS sum_used_amount,
    COALESCE(b.sum_booked, 0) AS sum_booked
  FROM public.customers c
  INNER JOIN org o ON o.id = c.organization_id
  LEFT JOIN booked b ON b.customer_id = c.id AND b.organization_id = c.organization_id
  LEFT JOIN refunded r ON r.customer_id = c.id AND r.organization_id = c.organization_id
  LEFT JOIN applied a ON a.customer_id = c.id AND a.organization_id = c.organization_id
  LEFT JOIN used u ON u.customer_id = c.id AND u.organization_id = c.organization_id
  WHERE c.deleted_at IS NULL
)
SELECT
  customer_name,
  pool_cap,
  applied_vouchers,
  ROUND((applied_vouchers - pool_cap)::numeric, 2) AS over_applied,
  sum_used_amount,
  sum_booked
FROM per_customer
WHERE applied_vouchers > pool_cap + 0.5
ORDER BY (applied_vouchers - pool_cap) DESC;

-- Per-row used_amount > amount:
WITH org AS (
  SELECT id FROM public.organizations WHERE slug = 'ella-noor' LIMIT 1
)
SELECT
  c.customer_name,
  ca.advance_number,
  ca.amount,
  ca.used_amount,
  ROUND((ca.used_amount - ca.amount)::numeric, 2) AS row_over
FROM public.customer_advances ca
INNER JOIN public.customers c ON c.id = ca.customer_id
INNER JOIN org o ON o.id = ca.organization_id
WHERE ca.used_amount > ca.amount + 0.5
ORDER BY row_over DESC;

-- After migration helpers exist:
-- SELECT proname FROM pg_proc
-- WHERE proname IN (
--   '_customer_advance_pool_cap',
--   '_customer_advance_applied_from_vouchers',
--   'guard_customer_advances_used_amount',
--   'guard_advance_over_application'
-- );
