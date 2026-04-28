-- Receipt vs Invoice paid_amount verification
-- Run this after deploying migrations to confirm cleanup.
-- Optional: set org id in the params CTE to scope to one organization.

WITH params AS (
  SELECT NULL::uuid AS p_org_id
),
receipt_totals AS (
  SELECT
    v.reference_id AS sale_id,
    SUM(COALESCE(v.total_amount, 0))::numeric(14,2) AS receipt_paid_total,
    MAX(v.voucher_date) AS last_receipt_date
  FROM public.voucher_entries v
  WHERE LOWER(COALESCE(v.voucher_type, '')) = 'receipt'
    AND v.reference_type = 'sale'
    AND v.reference_id IS NOT NULL
    AND v.deleted_at IS NULL
  GROUP BY v.reference_id
),
base AS (
  SELECT
    s.organization_id,
    s.id AS sale_id,
    s.sale_number,
    s.sale_date,
    s.customer_id,
    COALESCE(c.customer_name, '') AS customer_name,
    COALESCE(s.net_amount, 0)::numeric(14,2) AS net_amount,
    COALESCE(s.paid_amount, 0)::numeric(14,2) AS sales_paid_amount,
    COALESCE(rt.receipt_paid_total, 0)::numeric(14,2) AS receipt_paid_total,
    (COALESCE(rt.receipt_paid_total, 0) - COALESCE(s.paid_amount, 0))::numeric(14,2) AS delta_paid,
    s.payment_status,
    rt.last_receipt_date
  FROM public.sales s
  LEFT JOIN receipt_totals rt ON rt.sale_id = s.id
  LEFT JOIN public.customers c ON c.id = s.customer_id
  CROSS JOIN params p
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.sale_number, '') NOT LIKE 'Hold/%'
    AND (p.p_org_id IS NULL OR s.organization_id = p.p_org_id)
)
SELECT
  organization_id,
  sale_number,
  sale_date,
  customer_name,
  net_amount,
  sales_paid_amount,
  receipt_paid_total,
  delta_paid,
  payment_status,
  last_receipt_date
FROM base
WHERE ABS(delta_paid) > 0.01
ORDER BY organization_id, customer_name, sale_date, sale_number;

-- Quick summary count by organization (optional):
-- WITH mismatches AS (
--   SELECT organization_id
--   FROM base
--   WHERE ABS(delta_paid) > 0.01
-- )
-- SELECT organization_id, COUNT(*) AS mismatch_count
-- FROM mismatches
-- GROUP BY organization_id
-- ORDER BY mismatch_count DESC;
