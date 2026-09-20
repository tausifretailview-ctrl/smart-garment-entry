-- Confirms whether get_customer_party_balances times out for a heavy POS org,
-- and if so, profiles the paid_at_sale_drift-style correlated receipt subquery.
--
-- Run ONE block at a time in Supabase SQL editor (service role / postgres).
-- Before block 1 or 2: SET statement_timeout = '120s';
--
-- KS Footwear (POS): 4bc73037-e877-4123-9261-eb6e3876698c

-- =============================================================================
-- 1) End-to-end RPC row count (full party balance scan, no p_search)
-- =============================================================================
SELECT COUNT(*) AS party_balance_rows
FROM public.get_customer_party_balances(
  '4bc73037-e877-4123-9261-eb6e3876698c'::uuid,
  NULL
);

-- =============================================================================
-- 2) EXPLAIN paid_at_sale_drift suspect: reference_id::text, per-sale ve subquery
--    (same shape as _get_customer_party_balances_rows_v2 paid_at_sale_drift CTE)
-- =============================================================================
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  s.customer_id,
  SUM(GREATEST(
    0::numeric,
    GREATEST(COALESCE(s.cash_amount, 0), 0)
      + GREATEST(COALESCE(s.card_amount, 0), 0)
      + GREATEST(COALESCE(s.upi_amount, 0), 0)
    - COALESCE((
        SELECT SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
        FROM public.voucher_entries ve
        WHERE ve.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
          AND ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_id::text = s.id::text
      ), 0)
  )) AS drift_total
FROM public.sales s
WHERE s.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
  AND s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND (
    GREATEST(COALESCE(s.cash_amount, 0), 0)
    + GREATEST(COALESCE(s.card_amount, 0), 0)
    + GREATEST(COALESCE(s.upi_amount, 0), 0)
  ) > 0.005
GROUP BY s.customer_id;
