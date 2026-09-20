-- Advance pool vs live advance_adjustment vouchers (per customer).
-- over_applied > 0.5 ⇒ real vouchers exceed net pool (booked − refunds).
-- Requires migration 20260920200000 helpers (or inline the same sums).

-- Replace org slug/id:
--   ella-noor org id (example): look up organizations.slug = 'ella-noor'

WITH org AS (
  SELECT id FROM public.organizations WHERE slug = 'ella-noor' LIMIT 1
),
per_customer AS (
  SELECT
    c.id AS customer_id,
    c.customer_name,
    public._customer_advance_pool_cap(c.organization_id, c.id) AS pool_cap,
    public._customer_advance_applied_from_vouchers(c.organization_id, c.id, NULL) AS applied_vouchers,
    COALESCE((
      SELECT SUM(ca.used_amount)
      FROM public.customer_advances ca
      WHERE ca.organization_id = c.organization_id AND ca.customer_id = c.id
    ), 0) AS sum_used_amount,
    COALESCE((
      SELECT SUM(ca.amount)
      FROM public.customer_advances ca
      WHERE ca.organization_id = c.organization_id AND ca.customer_id = c.id
    ), 0) AS sum_booked
  FROM public.customers c
  INNER JOIN org o ON o.id = c.organization_id
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

-- Per-row used_amount > amount (simple cap violations):
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
