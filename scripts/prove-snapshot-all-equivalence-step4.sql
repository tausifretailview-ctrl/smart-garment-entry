-- =============================================================================
-- STEP 4 — snapshot_all vs get_customer_financial_snapshot (per-customer)
-- =============================================================================
-- Run in Lovable SQL editor under postgres / service role ONLY.
-- Highlight and run THIS FILE ONLY (not the commented block in timed.sql).
-- Expect one summary row: diff_rows = 0 means snapshot_all matches batch path.
--
-- NOTE: Step 4 can pass while Step 3 (party parity) fails — both snapshot_all
-- and per-customer snapshot share reconcile_customer_balance lineage; party RPC
-- uses the newer 20261126 body (_is_settlement_memo_receipt, remaining CN).
--
-- ELLA NOOR org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- Run after: SET statement_timeout = '300s';
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
    s.outstanding_dr,
    s.advance_available,
    s.cn_available_total,
    s.cn_pending_count
  FROM all_snap a
  CROSS JOIN LATERAL public.get_customer_financial_snapshot(
    a.customer_id,
    (SELECT org_id FROM params)
  ) AS s
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
