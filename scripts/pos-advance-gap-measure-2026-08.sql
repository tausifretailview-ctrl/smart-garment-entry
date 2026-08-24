-- Phase 0 measurement: POS counter cannot apply customer_advances (2026-08).
-- READ ONLY. No UPDATE/DELETE/INSERT.
-- Run as service_role / SQL editor. Anon RLS returns zero rows.
--
-- Unused remaining = amount - used_amount - refunds.
-- Live statuses: active | partially_used | fully_used (there is no 'used').
-- POS bills: sales.sale_number LIKE 'POS/%'.

-- 1) Orgs that ever book advances vs orgs that ever ring POS
SELECT
  (SELECT COUNT(DISTINCT organization_id) FROM public.customer_advances) AS orgs_with_any_advance,
  (SELECT COUNT(DISTINCT organization_id)
     FROM public.sales
    WHERE deleted_at IS NULL
      AND sale_number LIKE 'POS/%') AS orgs_with_any_pos_sale;

-- 2) Population: unused remaining now, and a POS sale after the earliest
--    still-unused booking. MIN not MAX: a later top-up must not hide a POS
--    bill that was already rung while unused advance existed.
WITH refunds AS (
  SELECT advance_id, COALESCE(SUM(refund_amount), 0) AS refunded
  FROM public.advance_refunds
  GROUP BY advance_id
),
advance_rows AS (
  SELECT
    ca.organization_id,
    ca.customer_id,
    ca.id,
    ca.created_at,
    ca.advance_date,
    GREATEST(
      0::numeric,
      COALESCE(ca.amount, 0)
        - COALESCE(ca.used_amount, 0)
        - COALESCE(r.refunded, 0)
    ) AS remaining
  FROM public.customer_advances ca
  LEFT JOIN refunds r ON r.advance_id = ca.id
  WHERE COALESCE(ca.status, 'active') IN ('active', 'partially_used')
),
unused AS (
  SELECT
    organization_id,
    customer_id,
    SUM(remaining) AS unused_balance,
    MIN(created_at) AS first_unused_advance_at
  FROM advance_rows
  WHERE remaining > 0.01
  GROUP BY organization_id, customer_id
),
pos_after AS (
  SELECT
    u.organization_id,
    u.customer_id,
    u.unused_balance,
    u.first_unused_advance_at,
    COUNT(*)::int AS pos_sales_after
  FROM unused u
  INNER JOIN public.sales s
    ON s.organization_id = u.organization_id
   AND s.customer_id = u.customer_id
   AND s.deleted_at IS NULL
   AND s.sale_number LIKE 'POS/%'
   AND COALESCE(s.created_at, s.sale_date) > u.first_unused_advance_at
  GROUP BY u.organization_id, u.customer_id, u.unused_balance, u.first_unused_advance_at
)
SELECT
  COUNT(*)::int AS customers_unused_advance_then_pos,
  COUNT(DISTINCT organization_id)::int AS orgs,
  COALESCE(SUM(unused_balance), 0) AS unused_balance_rupees
FROM pos_after;

-- 3) Screenshot candidates: unused advance, no open CN, has POS history
--    (open on POS, confirm orange Adv chip and no Cr ₹ footer)
WITH refunds AS (
  SELECT advance_id, COALESCE(SUM(refund_amount), 0) AS refunded
  FROM public.advance_refunds
  GROUP BY advance_id
),
unused AS (
  SELECT
    ca.organization_id,
    ca.customer_id,
    SUM(GREATEST(
      0::numeric,
      COALESCE(ca.amount, 0) - COALESCE(ca.used_amount, 0) - COALESCE(r.refunded, 0)
    )) AS unused_balance
  FROM public.customer_advances ca
  LEFT JOIN refunds r ON r.advance_id = ca.id
  WHERE COALESCE(ca.status, 'active') IN ('active', 'partially_used')
  GROUP BY ca.organization_id, ca.customer_id
  HAVING SUM(GREATEST(
    0::numeric,
    COALESCE(ca.amount, 0) - COALESCE(ca.used_amount, 0) - COALESCE(r.refunded, 0)
  )) > 0.01
),
open_cn AS (
  SELECT organization_id, customer_id,
         SUM(GREATEST(0, COALESCE(credit_amount, 0) - COALESCE(used_amount, 0))) AS cn_open
  FROM public.credit_notes
  WHERE COALESCE(status, 'active') = 'active'
    AND deleted_at IS NULL
  GROUP BY organization_id, customer_id
)
SELECT
  o.name AS org_name,
  o.slug AS org_slug,
  c.customer_name,
  c.phone,
  u.unused_balance,
  COALESCE(cn.cn_open, 0) AS cn_open,
  (
    SELECT COUNT(*) FROM public.sales s
     WHERE s.organization_id = u.organization_id
       AND s.customer_id = u.customer_id
       AND s.deleted_at IS NULL
       AND s.sale_number LIKE 'POS/%'
  ) AS pos_sale_count
FROM unused u
JOIN public.customers c
  ON c.id = u.customer_id
 AND c.organization_id = u.organization_id
JOIN public.organizations o ON o.id = u.organization_id
LEFT JOIN open_cn cn
  ON cn.organization_id = u.organization_id
 AND cn.customer_id = u.customer_id
WHERE COALESCE(cn.cn_open, 0) < 0.01
  AND EXISTS (
    SELECT 1 FROM public.sales s
     WHERE s.organization_id = u.organization_id
       AND s.customer_id = u.customer_id
       AND s.deleted_at IS NULL
       AND s.sale_number LIKE 'POS/%'
  )
ORDER BY u.unused_balance DESC
LIMIT 15;
