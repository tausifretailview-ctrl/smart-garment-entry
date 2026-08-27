-- =============================================================================
-- ELLA NOOR — timed snapshot_all proof (Lovable / Supabase SQL editor)
-- =============================================================================
-- postgres / service role. **Run ONE block at a time** — highlight only the
-- block you want, then Run. Do NOT run the whole file (Step 3 auth-fails below).
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67 (ELLA NOOR)
-- =============================================================================


-- ---------------------------------------------------------------------------
-- DIAG — auth context (run first; paste result to Cursor)
-- ---------------------------------------------------------------------------
SELECT
  current_user AS db_role,
  auth.uid() AS auth_uid,
  auth.role() AS auth_role,
  CASE
    WHEN auth.uid() IS NULL THEN 'snapshot_all OK; per-customer snapshot FAILS (Step 3)'
    ELSE 'Authenticated — Step 3 may work if you are an org member'
  END AS editor_hint;


-- ---------------------------------------------------------------------------
-- STEP 0 — raise timeout (run alone before Step 1 / 2)
-- ---------------------------------------------------------------------------
SET statement_timeout = '120s';


-- ---------------------------------------------------------------------------
-- STEP 1 — snapshot_all wall time (app-relevant single-call cost)
-- Expect NOTICE: snapshot_all rows=… elapsed_ms=…
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  t0 timestamptz := clock_timestamp();
  n bigint;
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.get_customer_financial_snapshot_all(
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  );
  RAISE NOTICE 'snapshot_all rows=% elapsed_ms=%',
    n,
    ROUND(extract(epoch FROM (clock_timestamp() - t0)) * 1000);
END $$;


-- ---------------------------------------------------------------------------
-- STEP 2 — EXPLAIN ANALYZE (plan + actual execution time)
-- **Select ONLY from EXPLAIN through the closing semicolon.**
-- Does NOT call get_customer_financial_snapshot — if you see assert_org_member
-- in the error, you accidentally included Step 3 (or ran the whole file).
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM public.get_customer_financial_snapshot_all(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
);


-- ---------------------------------------------------------------------------
-- STEP 3 — SQL EDITOR SAFE equivalence (party RPC vs snapshot_all)
-- Replaces the old Step 3 that used get_customer_financial_snapshot per row
-- (42501 Authentication required via assert_org_member in SQL editor).
-- Expect diff_rows = 0. Tolerances: 0.01 on money fields.
-- ---------------------------------------------------------------------------
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
compared AS (
  SELECT
    a.customer_id,
    ABS(COALESCE(a.outstanding_dr, 0) - COALESCE(p.signed_balance, 0)) AS d_outstanding,
    ABS(COALESCE(a.advance_available, 0) - COALESCE(p.advance_available, 0)) AS d_advance
  FROM all_snap a
  INNER JOIN party p ON p.customer_id = a.customer_id
)
SELECT
  (SELECT org_id FROM params) AS org_id,
  (SELECT COUNT(*) FROM all_snap) AS active_customers,
  COUNT(*) FILTER (WHERE d_outstanding > 0.01 OR d_advance > 0.01) AS diff_rows,
  COUNT(*) FILTER (WHERE d_outstanding > 0.01) AS outstanding_mismatches,
  COUNT(*) FILTER (WHERE d_advance > 0.01) AS advance_mismatches,
  ROUND(MAX(d_outstanding)::numeric, 4) AS max_outstanding_delta,
  ROUND(MAX(d_advance)::numeric, 4) AS max_advance_delta
FROM compared;


-- ---------------------------------------------------------------------------
-- STEP 3b — CN pool parity (SQL editor safe; _customer_cn_available_total)
-- Run after Step 3 if you need CN fields checked. Slower (per active customer).
-- Expect diff_rows = 0.
-- ---------------------------------------------------------------------------
WITH params AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id
),
all_snap AS (
  SELECT customer_id, cn_available_total, cn_pending_count
  FROM public.get_customer_financial_snapshot_all((SELECT org_id FROM params))
),
canonical AS (
  SELECT
    a.customer_id,
    cn.cn_available_total,
    cn.cn_pending_count
  FROM all_snap a
  CROSS JOIN LATERAL public._customer_cn_available_total(
    a.customer_id,
    (SELECT org_id FROM params)
  ) AS cn
),
compared AS (
  SELECT
    ABS(COALESCE(a.cn_available_total, 0) - COALESCE(c.cn_available_total, 0)) AS d_cn,
    ABS(COALESCE(a.cn_pending_count, 0) - COALESCE(c.cn_pending_count, 0)) AS d_cn_count
  FROM all_snap a
  INNER JOIN canonical c ON c.customer_id = a.customer_id
)
SELECT
  COUNT(*) FILTER (WHERE d_cn > 0.01 OR d_cn_count > 0) AS diff_rows,
  ROUND(MAX(d_cn)::numeric, 4) AS max_cn_delta
FROM compared;


-- ---------------------------------------------------------------------------
-- STEP 4 — full batch equivalence (JWT / Node only — DO NOT run in SQL editor)
-- Uses get_customer_financial_snapshot per row → assert_org_member failure.
-- Run: node scripts/prove-snapshot-all-equivalence.mjs with SUPABASE_ACCESS_TOKEN
-- ---------------------------------------------------------------------------
/*
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
  ) AS diff_rows
FROM compared;
*/
