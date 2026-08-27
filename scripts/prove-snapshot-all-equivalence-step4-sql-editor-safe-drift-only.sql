-- =============================================================================
-- STEP 4 (SQL editor safe, drift-only) — snapshot_all vs reconcile on mismatches
-- =============================================================================
-- Full step4-safe (all 2,377 customers) → "Server Error" in Lovable (gateway timeout).
-- This runs ONLY customers where Step 3 already found party vs snapshot_all drift
-- (~113 rows). Enough to confirm snapshot_all ≠ reconcile/per-customer path.
--
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
party AS (
  SELECT customer_id, signed_balance, advance_available
  FROM public.get_customer_party_balances((SELECT org_id FROM params))
),
targets AS (
  SELECT a.customer_id
  FROM all_snap a
  INNER JOIN party p ON p.customer_id = a.customer_id
  WHERE ABS(a.outstanding_dr - p.signed_balance) > 0.01
     OR ABS(COALESCE(a.advance_available, 0) - COALESCE(p.advance_available, 0)) > 0.01
),
canonical AS (
  SELECT
    t.customer_id,
    canon.outstanding_dr,
    adv.advance_available,
    cn.cn_available_total,
    cn.cn_pending_count
  FROM targets t
  CROSS JOIN LATERAL (
    SELECT COALESCE(SUM(r.amount), 0)::numeric AS outstanding_dr
    FROM public.reconcile_customer_balance(
      t.customer_id,
      (SELECT org_id FROM params)
    ) r
  ) canon
  CROSS JOIN LATERAL (
    SELECT public._customer_advance_available(
      t.customer_id,
      (SELECT org_id FROM params)
    )::numeric AS advance_available
  ) adv
  CROSS JOIN LATERAL public._customer_cn_available_total(
    t.customer_id,
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
  INNER JOIN targets t ON t.customer_id = a.customer_id
)
SELECT
  (SELECT org_id FROM params) AS org_id,
  (SELECT COUNT(*) FROM targets) AS drift_target_customers,
  (SELECT COUNT(*) FROM all_snap) AS snapshot_all_rows,
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
