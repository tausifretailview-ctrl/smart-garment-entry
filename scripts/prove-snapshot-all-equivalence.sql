-- =============================================================================
-- Phase 1b — prove get_customer_financial_snapshot_all ≡ per-customer snapshot
-- =============================================================================
-- Run in Supabase SQL editor (postgres / service role). auth.uid() is NULL there,
-- so the org membership guard is skipped — same as other admin proofs.
--
-- HOW TO RUN:
--   1. Set org_id in params (use a LARGE org first, then a smaller different one).
--   2. Run SECTION A (summary). Expect diff_rows = 0.
--   3. If diff_rows > 0, run SECTION B (detail) and export CSV.
--   4. Repeat for a second organisation.
--
-- Do NOT switch app callers until TWO orgs show diff_rows = 0.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- SECTION A — summary (edit org_id, then run this whole block)
-- ---------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id  -- ← EDIT
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
    a.outstanding_dr AS all_outstanding_dr,
    c.outstanding_dr AS snap_outstanding_dr,
    a.advance_available AS all_advance_available,
    c.advance_available AS snap_advance_available,
    a.cn_available_total AS all_cn_available_total,
    c.cn_available_total AS snap_cn_available_total,
    a.cn_pending_count AS all_cn_pending_count,
    c.cn_pending_count AS snap_cn_pending_count,
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

-- ---------------------------------------------------------------------------
-- SECTION B — mismatch detail (only if SECTION A diff_rows > 0)
-- ---------------------------------------------------------------------------
/*
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id  -- ← same org
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
)
SELECT
  a.customer_id,
  a.outstanding_dr AS all_outstanding_dr,
  c.outstanding_dr AS snap_outstanding_dr,
  ROUND((a.outstanding_dr - c.outstanding_dr)::numeric, 4) AS d_outstanding,
  a.advance_available AS all_advance,
  c.advance_available AS snap_advance,
  ROUND((a.advance_available - c.advance_available)::numeric, 4) AS d_advance,
  a.cn_available_total AS all_cn,
  c.cn_available_total AS snap_cn,
  ROUND((a.cn_available_total - c.cn_available_total)::numeric, 4) AS d_cn,
  a.cn_pending_count AS all_cn_count,
  c.cn_pending_count AS snap_cn_count
FROM all_snap a
INNER JOIN canonical c ON c.customer_id = a.customer_id
WHERE ABS(COALESCE(a.outstanding_dr, 0) - COALESCE(c.outstanding_dr, 0)) > 0.01
   OR ABS(COALESCE(a.advance_available, 0) - COALESCE(c.advance_available, 0)) > 0.01
   OR ABS(COALESCE(a.cn_available_total, 0) - COALESCE(c.cn_available_total, 0)) > 0.01
   OR COALESCE(a.cn_pending_count, 0) <> COALESCE(c.cn_pending_count, 0)
ORDER BY ABS(COALESCE(a.outstanding_dr, 0) - COALESCE(c.outstanding_dr, 0)) DESC
LIMIT 100;
*/
