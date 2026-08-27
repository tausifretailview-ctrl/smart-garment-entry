-- =============================================================================
-- STEP 4 (SQL editor safe) — snapshot_all vs canonical snapshot components
-- =============================================================================
-- Cloud blocks get_customer_financial_snapshot in the SQL editor:
--   get_customer_true_outstanding → assert_org_member → 42501 Authentication required
--
-- This script is equivalent to Step 4 (same fields as get_customer_financial_snapshot)
-- but calls the underlying helpers directly (same pattern as verify-customer-party-
-- balances-parity.sql):
--   outstanding_dr  = SUM(reconcile_customer_balance)
--   advance_available = _customer_advance_available
--   CN              = _customer_cn_available_total
--
-- Run ONE block. SET statement_timeout first. Slow on ELLA NOOR (~minutes).
-- ELLA NOOR: 3fdca631-1e0c-4417-9704-421f5129ff67
-- =============================================================================

SET statement_timeout = '300s';

WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
all_snap AS (
  SELECT *
  FROM public.get_customer_financial_snapshot_all((SELECT org_id FROM params))
),
canonical AS (
  SELECT
    a.customer_id,
    canon.outstanding_dr,
    adv.advance_available,
    cn.cn_available_total,
    cn.cn_pending_count
  FROM all_snap a
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(r.amount), 0)::numeric AS outstanding_dr
    FROM public.reconcile_customer_balance(
      a.customer_id,
      (SELECT org_id FROM params)
    ) r
  ) canon
  CROSS JOIN LATERAL (
    SELECT public._customer_advance_available(
      a.customer_id,
      (SELECT org_id FROM params)
    )::numeric AS advance_available
  ) adv
  CROSS JOIN LATERAL public._customer_cn_available_total(
    a.customer_id,
    (SELECT org_id FROM params)
  ) cn
),
compared AS (
  SELECT
    a.customer_id,
    ABS(COALESCE(a.outstanding_dr, 0) - COALESCE(c.outstanding_dr, 0)) AS d_outstanding,
    ABS(COALESCE(a.advance_available, 0) - COALESCE(c.advance_available, 0)) AS d_advance,
    ABS(COALESCE(a.cn_available_total, 0) - COALESCE(c.cn_available_total, 0)) AS d_cn,
    ABS(COALESCE(a.cn_pending_count, 0) - COALESCE(c.cn_pending_count, 0)) AS d_cn_count
  FROM all_snap a
  INNER JOIN canonical c ON c.customer_id = a.customer_id
)
SELECT
  (SELECT org_id FROM params) AS org_id,
  (SELECT COUNT(*) FROM all_snap) AS active_customers,
  COUNT(*) FILTER (
    WHERE d_outstanding > 0.01
       OR d_advance > 0.01
       OR d_cn > 0.01
       OR d_cn_count > 0
  ) AS diff_rows,
  COUNT(*) FILTER (WHERE d_outstanding > 0.01) AS outstanding_mismatches,
  COUNT(*) FILTER (WHERE d_advance > 0.01) AS advance_mismatches,
  COUNT(*) FILTER (WHERE d_cn > 0.01 OR d_cn_count > 0) AS cn_mismatches,
  ROUND(MAX(d_outstanding)::numeric, 4) AS max_outstanding_delta,
  ROUND(MAX(d_advance)::numeric, 4) AS max_advance_delta,
  ROUND(MAX(d_cn)::numeric, 4) AS max_cn_delta
FROM compared;
