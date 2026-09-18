-- MASEERA-class ledger population scope — READ ONLY.
-- Run in SQL editor. Do not mutate. This environment has no tenant DB access.
-- Org filter optional: set v_org in the first CTE or leave NULL for all orgs.

-- 1. Customers whose ledger currently DROPS a sale-return row
--    (credit_status = adjusted AND linked_sale_id set, not deleted).
WITH scoped AS (
  SELECT sr.organization_id, sr.customer_id, sr.id, sr.return_number,
         sr.net_amount, sr.credit_available_balance, sr.linked_sale_id, sr.credit_note_id
  FROM public.sale_returns sr
  WHERE sr.deleted_at IS NULL
    AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
    AND sr.linked_sale_id IS NOT NULL
)
SELECT
  o.name AS org_name,
  COUNT(*) AS dropped_sr_rows,
  COUNT(DISTINCT s.customer_id) AS customer_count
FROM scoped s
JOIN public.organizations o ON o.id = s.organization_id
GROUP BY o.name
ORDER BY dropped_sr_rows DESC;

-- 1b. Dropped rows that still have CN leftover (skip + remainder class)
SELECT
  o.name AS org_name,
  c.customer_name,
  sr.return_number,
  sr.net_amount,
  sr.credit_available_balance,
  GREATEST(0, COALESCE(cn.credit_amount, 0) - COALESCE(cn.used_amount, 0)) AS cn_live_remaining,
  s.sale_number AS linked_invoice
FROM public.sale_returns sr
JOIN public.organizations o ON o.id = sr.organization_id
JOIN public.customers c
  ON c.id = sr.customer_id AND c.organization_id = sr.organization_id
LEFT JOIN public.credit_notes cn
  ON cn.id = sr.credit_note_id AND cn.deleted_at IS NULL
LEFT JOIN public.sales s ON s.id = sr.linked_sale_id
WHERE sr.deleted_at IS NULL
  AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
  AND sr.linked_sale_id IS NOT NULL
  AND GREATEST(
        COALESCE(sr.credit_available_balance, 0),
        COALESCE(cn.credit_amount, 0) - COALESCE(cn.used_amount, 0)
      ) > 0.5
ORDER BY o.name, c.customer_name, sr.return_date;

-- 2. Mis-dated CN Adjust rows (voucher_date ≠ linked sale_date)
SELECT
  o.name AS org_name,
  COUNT(*) AS misdated_cn_adjust_rows,
  COUNT(DISTINCT ve.reference_id) AS invoice_count,
  COUNT(DISTINCT s.customer_id) AS customer_count
FROM public.voucher_entries ve
JOIN public.sales s
  ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
JOIN public.organizations o ON o.id = ve.organization_id
WHERE ve.deleted_at IS NULL
  AND ve.voucher_type = 'receipt'
  AND ve.payment_method = 'credit_note_adjustment'
  AND s.deleted_at IS NULL
  AND ve.voucher_date IS DISTINCT FROM s.sale_date
GROUP BY o.name
ORDER BY misdated_cn_adjust_rows DESC;

-- 2b. Sample of mis-dated rows (cap 200)
SELECT
  o.name AS org_name,
  c.customer_name,
  s.sale_number,
  s.sale_date AS invoice_date,
  ve.voucher_date AS cn_voucher_date,
  ve.voucher_number,
  ve.total_amount
FROM public.voucher_entries ve
JOIN public.sales s
  ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
JOIN public.organizations o ON o.id = ve.organization_id
JOIN public.customers c
  ON c.id = s.customer_id AND c.organization_id = s.organization_id
WHERE ve.deleted_at IS NULL
  AND ve.voucher_type = 'receipt'
  AND ve.payment_method = 'credit_note_adjustment'
  AND s.deleted_at IS NULL
  AND ve.voucher_date IS DISTINCT FROM s.sale_date
ORDER BY ve.organization_id, ve.voucher_date DESC
LIMIT 200;

-- 3. FIFO-split SRA: two or more sale returns share one linked_sale_id
--    (Maseera ₹1,000 banner gap: remaining uses full invoice SRA).
SELECT
  o.name AS org_name,
  c.customer_name,
  s.sale_number,
  s.sale_return_adjust,
  COUNT(*) AS sr_count,
  SUM(sr.net_amount) AS sr_net_sum,
  ARRAY_AGG(sr.return_number ORDER BY sr.return_date, sr.created_at) AS return_numbers
FROM public.sale_returns sr
JOIN public.organizations o ON o.id = sr.organization_id
JOIN public.customers c
  ON c.id = sr.customer_id AND c.organization_id = sr.organization_id
JOIN public.sales s
  ON s.id = sr.linked_sale_id AND s.organization_id = sr.organization_id
WHERE sr.deleted_at IS NULL
  AND sr.linked_sale_id IS NOT NULL
  AND s.deleted_at IS NULL
GROUP BY o.name, c.customer_name, s.sale_number, s.sale_return_adjust
HAVING COUNT(*) >= 2
ORDER BY o.name, c.customer_name;

-- 3b. Headline counts for query 3
SELECT
  COUNT(*) AS split_invoice_count,
  COUNT(DISTINCT customer_name) AS customer_count,
  COUNT(DISTINCT org_name) AS org_count
FROM (
  SELECT
    o.name AS org_name,
    c.customer_name,
    s.id
  FROM public.sale_returns sr
  JOIN public.organizations o ON o.id = sr.organization_id
  JOIN public.customers c
    ON c.id = sr.customer_id AND c.organization_id = sr.organization_id
  JOIN public.sales s
    ON s.id = sr.linked_sale_id AND s.organization_id = sr.organization_id
  WHERE sr.deleted_at IS NULL
    AND sr.linked_sale_id IS NOT NULL
    AND s.deleted_at IS NULL
  GROUP BY o.name, c.customer_name, s.id
  HAVING COUNT(*) >= 2
) x;
