-- =============================================================================
-- QUERY B — Per-customer summary (run after setting org UUID)
-- Copy this entire block into Supabase SQL editor (separate from QUERY A).
-- =============================================================================

WITH params AS (
  SELECT 'YOUR_ORGANIZATION_UUID'::uuid AS organization_id
),

adj_rows AS (
  SELECT
    cba.id AS adjustment_id,
    cba.organization_id,
    cba.customer_id,
    c.customer_name,
    c.phone,
    cba.adjustment_date,
    cba.created_at,
    cba.previous_outstanding,
    cba.new_outstanding,
    cba.outstanding_difference,
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
  f.customer_id,
  f.customer_name,
  f.phone,
  COUNT(*) AS bad_adjustment_count,
  ROUND(SUM(GREATEST(0, f.excess_over_correction)), 2) AS total_excess_over_correction,
  ROUND(public.get_customer_true_outstanding(f.customer_id, f.organization_id), 2) AS current_outstanding,
  ROUND(MAX(f.new_outstanding), 2) AS last_target_outstanding,
  ROUND(
    public.get_customer_true_outstanding(f.customer_id, f.organization_id) - MAX(f.new_outstanding),
    2
  ) AS drift_from_target,
  STRING_AGG(f.adjustment_id::text, ', ' ORDER BY f.created_at DESC) AS adjustment_ids
FROM flagged f
WHERE f.issue_class <> 'OK_OR_MINOR'
GROUP BY f.customer_id, f.customer_name, f.phone, f.organization_id
ORDER BY total_excess_over_correction DESC;
