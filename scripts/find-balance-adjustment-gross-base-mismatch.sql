-- =============================================================================
-- Find customers affected by WRONG previous_outstanding on balance adjustments
-- =============================================================================
-- Bug signature: adjustment used opening + gross invoiced (no payments) as
-- "Current Outstanding" (e.g. ₹15,000) while true ledger was lower (e.g. ₹7,300 Dr).
-- User entered New Outstanding ₹5,700 → system posted −₹9,300 instead of −₹1,600.
--
-- HOW TO USE (Supabase SQL editor):
--   1. Replace YOUR_ORGANIZATION_UUID in params below.
--   2. Run QUERY A — lists every suspicious adjustment row.
--   3. Run QUERY B — per-customer summary with current vs target outstanding.
--   4. Run QUERY C — quick counts by issue class.
--   5. Repair: delete/reverse flagged adjustment in UI, re-save with fixed app.
--   6. Per-row verify: scripts/verify-balance-adjustment-fifo.sql
-- =============================================================================


-- =============================================================================
-- QUERY A — Suspicious adjustment rows (detail)
-- =============================================================================
WITH params AS (
  SELECT 'YOUR_ORGANIZATION_UUID'::uuid AS organization_id
  -- SELECT NULL::uuid AS organization_id  -- all orgs (service_role only)
),

adj_rows AS (
  SELECT
    cba.id AS adjustment_id,
    cba.organization_id,
    cba.customer_id,
    c.customer_name,
    c.phone,
    c.opening_balance,
    cba.adjustment_date,
    cba.created_at,
    cba.previous_outstanding,
    cba.new_outstanding,
    cba.outstanding_difference,
    cba.reason,
    COALESCE(c.opening_balance, 0) + COALESCE((
      SELECT SUM(s.net_amount)
      FROM public.sales s
      WHERE s.organization_id = cba.organization_id
        AND s.customer_id = cba.customer_id
        AND s.deleted_at IS NULL
        AND COALESCE(s.is_cancelled, false) = false
        AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
        AND s.sale_date <= COALESCE(cba.adjustment_date, cba.created_at::date)
    ), 0) AS gross_no_payments_base,
    COALESCE((
      SELECT SUM(
        GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
      )
      FROM public.voucher_entries ve
      WHERE ve.organization_id = cba.organization_id
        AND ve.deleted_at IS NULL
        AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
        AND NOT (
          lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
          OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
          OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
        )
        AND ve.voucher_date <= COALESCE(cba.adjustment_date, cba.created_at::date)
        AND (
          EXISTS (
            SELECT 1 FROM public.sales s
            WHERE s.organization_id = cba.organization_id
              AND s.customer_id = cba.customer_id
              AND s.deleted_at IS NULL
              AND s.id::text = ve.reference_id::text
          )
          OR (
            lower(COALESCE(ve.reference_type, '')) = 'customer'
            AND trim(ve.reference_id::text) = trim(cba.customer_id::text)
          )
        )
    ), 0) AS receipts_to_adj_date,
    COALESCE((
      SELECT SUM(c2.outstanding_difference)
      FROM public.customer_balance_adjustments c2
      WHERE c2.organization_id = cba.organization_id
        AND c2.customer_id = cba.customer_id
        AND c2.created_at < cba.created_at
    ), 0) AS prior_adj_total,
    COALESCE((
      SELECT SUM(ve.total_amount)
      FROM public.voucher_entries ve
      WHERE ve.organization_id = cba.organization_id
        AND ve.deleted_at IS NULL
        AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
        AND lower(COALESCE(ve.payment_method, '')) = 'balance_adjustment'
        AND ve.description LIKE '%adj_id:' || cba.id::text || '%'
    ), 0) AS fifo_voucher_total
  FROM public.customer_balance_adjustments cba
  JOIN public.customers c
    ON c.id = cba.customer_id
   AND c.organization_id = cba.organization_id
  CROSS JOIN params p
  WHERE (p.organization_id IS NULL OR cba.organization_id = p.organization_id)
    AND c.deleted_at IS NULL
),

scored AS (
  SELECT
    a.*,
    ROUND(a.gross_no_payments_base - a.receipts_to_adj_date + a.prior_adj_total, 2) AS estimated_true_before,
    ABS(a.previous_outstanding - a.gross_no_payments_base) <= 1.5 AS gross_base_bug,
    GREATEST(0::numeric, ROUND(
      a.gross_no_payments_base - a.receipts_to_adj_date + a.prior_adj_total - a.new_outstanding, 2
    )) AS correct_dr_reduction,
    ROUND(
      a.fifo_voucher_total
      + ABS(CASE WHEN a.outstanding_difference < 0 THEN a.outstanding_difference ELSE 0 END),
      2
    ) AS applied_dr_reduction
  FROM adj_rows a
  WHERE a.outstanding_difference < -0.5
),

flagged AS (
  SELECT
    s.*,
    ROUND(s.applied_dr_reduction - s.correct_dr_reduction, 2) AS excess_over_correction,
    CASE
      WHEN s.gross_base_bug
           AND (s.applied_dr_reduction - s.correct_dr_reduction) > 1
        THEN 'LIKELY_GROSS_BASE_BUG'
      WHEN ABS(s.previous_outstanding - s.estimated_true_before) > 50
           AND (s.applied_dr_reduction - s.correct_dr_reduction) > 1
        THEN 'PREV_OUTSTANDING_MISMATCH'
      WHEN (s.applied_dr_reduction - s.correct_dr_reduction) > 1
        THEN 'OVER_CORRECTION_REVIEW'
      ELSE 'OK_OR_MINOR'
    END AS issue_class
  FROM scored s
)

SELECT
  issue_class,
  customer_name,
  phone,
  adjustment_id,
  adjustment_date,
  created_at::date AS created_on,
  previous_outstanding AS stored_prev_outstanding,
  gross_no_payments_base,
  estimated_true_before,
  new_outstanding AS target_outstanding,
  outstanding_difference,
  fifo_voucher_total,
  applied_dr_reduction,
  correct_dr_reduction,
  excess_over_correction,
  receipts_to_adj_date,
  prior_adj_total,
  LEFT(reason, 100) AS reason
FROM flagged
WHERE issue_class <> 'OK_OR_MINOR'
ORDER BY excess_over_correction DESC, created_at DESC;


-- =============================================================================
-- QUERY B — Per-customer summary (current outstanding vs last target)
-- =============================================================================
/*
WITH params AS (
  SELECT 'YOUR_ORGANIZATION_UUID'::uuid AS organization_id
),
adj_rows AS (
  -- same as QUERY A adj_rows CTE
  ...
),
scored AS ( ... ),
flagged AS ( ... )
SELECT
  f.customer_id,
  f.customer_name,
  f.phone,
  COUNT(*) AS bad_adjustment_count,
  ROUND(SUM(GREATEST(0, f.excess_over_correction)), 2) AS total_excess_over_correction,
  ROUND(COALESCE(cc.current_outstanding, 0), 2) AS current_outstanding,
  ROUND(MAX(f.new_outstanding), 2) AS last_target_outstanding,
  ROUND(COALESCE(cc.current_outstanding, 0) - MAX(f.new_outstanding), 2) AS drift_from_target
FROM flagged f
LEFT JOIN (
  SELECT
    c.id AS customer_id,
    (
      SELECT COALESCE(SUM(r.amount), 0)::numeric
      FROM public.reconcile_customer_balance(c.id, c.organization_id) AS r
    ) AS current_outstanding
  FROM public.customers c
  CROSS JOIN params p
  WHERE c.organization_id = p.organization_id
) cc ON cc.customer_id = f.customer_id
WHERE f.issue_class <> 'OK_OR_MINOR'
GROUP BY f.customer_id, f.customer_name, f.phone, f.organization_id, cc.current_outstanding
ORDER BY total_excess_over_correction DESC;
*/


-- =============================================================================
-- QUERY C — Org-wide issue counts
-- =============================================================================
/*
-- Re-run QUERY A CTEs, then:
SELECT issue_class, COUNT(*) AS rows
FROM flagged
GROUP BY 1
ORDER BY 2 DESC;
*/
