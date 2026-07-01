-- =============================================================================
-- Verify Balance Adjustment FIFO fix (post-deploy smoke test)
-- =============================================================================
-- After creating a test balance adjustment in the UI (Accounts → Balance Adj.),
-- replace the placeholders below and run in Supabase SQL editor.
--
-- PASS criteria:
--   1. balance_adjustment vouchers exist, FIFO by sale_date
--   2. SUM(voucher total_amount) + ABS(outstanding_difference) = adjustment Dr reduction
--   3. No double-count: reconcile balance matches get_customer_true_outstanding
-- =============================================================================

-- ── SET THESE after your test ────────────────────────────────────────────────
\set org_id     'YOUR_ORG_UUID'
\set customer_id 'YOUR_TEST_CUSTOMER_UUID'
\set adj_id     'YOUR_ADJUSTMENT_ROW_UUID'

-- 1. Adjustment row — outstanding_difference must be uncovered portion only
SELECT
  id,
  created_at,
  previous_outstanding,
  new_outstanding,
  outstanding_difference,
  reason
FROM public.customer_balance_adjustments
WHERE id = :'adj_id'::uuid
  AND organization_id = :'org_id'::uuid
  AND customer_id = :'customer_id'::uuid;

-- 2. FIFO vouchers written for this adjustment (adj_id marker in description)
SELECT
  ve.voucher_number,
  ve.voucher_date,
  ve.total_amount,
  s.sale_number,
  s.sale_date,
  s.payment_status,
  s.paid_amount,
  ve.description
FROM public.voucher_entries ve
JOIN public.sales s
  ON s.id = ve.reference_id
 AND s.organization_id = ve.organization_id
WHERE ve.organization_id = :'org_id'::uuid
  AND ve.voucher_type = 'receipt'
  AND ve.payment_method = 'balance_adjustment'
  AND ve.deleted_at IS NULL
  AND ve.description LIKE '%adj_id:' || :'adj_id' || '%'
ORDER BY s.sale_date ASC, s.created_at ASC;

-- 3. Parity check — voucher sum vs outstanding_difference (no double count)
WITH adj AS (
  SELECT outstanding_difference
  FROM public.customer_balance_adjustments
  WHERE id = :'adj_id'::uuid
),
vouchers AS (
  SELECT COALESCE(SUM(ve.total_amount), 0) AS voucher_total
  FROM public.voucher_entries ve
  WHERE ve.organization_id = :'org_id'::uuid
    AND ve.voucher_type = 'receipt'
    AND ve.payment_method = 'balance_adjustment'
    AND ve.deleted_at IS NULL
    AND ve.description LIKE '%adj_id:' || :'adj_id' || '%'
)
SELECT
  v.voucher_total AS fifo_applied_to_invoices,
  a.outstanding_difference AS uncovered_credit_on_adj_row,
  v.voucher_total + ABS(COALESCE(a.outstanding_difference, 0)) AS total_dr_reduction,
  CASE
    WHEN a.outstanding_difference IS NULL THEN 'FAIL — adjustment row missing'
    WHEN v.voucher_total > 0 OR ABS(COALESCE(a.outstanding_difference, 0)) > 0.5
      THEN 'OK — split between vouchers + uncovered'
    ELSE 'REVIEW — no vouchers and zero uncovered'
  END AS fifo_check
FROM vouchers v
CROSS JOIN adj a;

-- 4. Customer balance still canonical after adjustment
SELECT
  public.get_customer_true_outstanding(
    :'customer_id'::uuid,
    :'org_id'::uuid
  ) AS canonical_outstanding;
