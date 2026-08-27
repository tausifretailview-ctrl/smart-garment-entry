-- =============================================================================
-- Step 3 — party vs snapshot_all parity (parameterized org)
-- Edit org_id below. Expect diff_rows = 0.
-- Second-org candidates (different shape than ELLA NOOR invoice org):
--   KS FOOTWEAR (POS)  4bc73037-e877-4123-9261-eb6e3876698c
--   VELVET (POS)       dafc3d0c-874e-4784-bac3-5eab5f3c85b5
-- =============================================================================

SET statement_timeout = '120s';

WITH params AS (
  SELECT '4bc73037-e877-4123-9261-eb6e3876698c'::uuid AS org_id  -- ← EDIT
),
all_snap AS (
  SELECT customer_id, outstanding_dr, advance_available
  FROM public.get_customer_financial_snapshot_all((SELECT org_id FROM params))
),
party AS (
  SELECT customer_id, signed_balance, advance_available
  FROM public.get_customer_party_balances((SELECT org_id FROM params))
),
compared AS (
  SELECT
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
