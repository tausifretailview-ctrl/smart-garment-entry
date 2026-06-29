-- Parity gate: detects future drift between sales.sale_return_adjust and
-- the actual sale_returns + credit_notes records that should back it.
-- Run per-organization. A non-empty result indicates phantom CN/SR adjustments
-- (same class of bug as the 2026-06-06 cn_over_apply_repair phantom rows).
--
-- Usage:
--   \set org_id '3fdca631-1e0c-4417-9704-421f5129ff67'
--   \i scripts/audit-balance-formula-parity.sql

WITH applied AS (
  SELECT customer_id,
         COALESCE(SUM(sale_return_adjust), 0) AS applied_amt
  FROM sales
  WHERE organization_id = :'org_id'
    AND deleted_at IS NULL
    AND COALESCE(is_cancelled, false) = false
  GROUP BY customer_id
),
real_sr AS (
  SELECT customer_id,
         COALESCE(SUM(net_amount), 0) AS sr_amt
  FROM sale_returns
  WHERE organization_id = :'org_id'
    AND deleted_at IS NULL
  GROUP BY customer_id
),
real_cn AS (
  SELECT customer_id,
         COALESCE(SUM(used_amount), 0) AS cn_used_amt
  FROM credit_notes
  WHERE organization_id = :'org_id'
    AND deleted_at IS NULL
  GROUP BY customer_id
)
SELECT c.id              AS customer_id,
       c.customer_name,
       a.applied_amt     AS applied_to_invoices,
       COALESCE(rs.sr_amt, 0)   AS real_sale_returns,
       COALESCE(rc.cn_used_amt, 0) AS real_credit_note_used,
       a.applied_amt - COALESCE(rs.sr_amt, 0) - COALESCE(rc.cn_used_amt, 0) AS phantom_inflation
FROM applied a
JOIN customers c ON c.id = a.customer_id
LEFT JOIN real_sr rs ON rs.customer_id = a.customer_id
LEFT JOIN real_cn rc ON rc.customer_id = a.customer_id
WHERE a.applied_amt - COALESCE(rs.sr_amt, 0) - COALESCE(rc.cn_used_amt, 0) > 1
ORDER BY phantom_inflation DESC;