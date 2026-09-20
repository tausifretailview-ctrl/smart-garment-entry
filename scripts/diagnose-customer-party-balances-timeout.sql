-- Confirms whether get_customer_party_balances times out for a heavy POS org,
-- and isolates paid_at_sale_drift cost (legacy correlated vs current grouped join).
--
-- Run ONE block at a time in Supabase / Lovable SQL editor.
-- Prefer: SET statement_timeout = '120s';  (editor HTTP limit may still kill long ANALYZE)
--
-- KS Footwear (POS): 4bc73037-e877-4123-9261-eb6e3876698c

-- =============================================================================
-- 0) Volume (cheap — run first)
-- =============================================================================
SELECT
  (SELECT COUNT(*) FROM public.sales s
   WHERE s.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
     AND s.deleted_at IS NULL
     AND COALESCE(s.is_cancelled, false) = false) AS sales_active,
  (SELECT COUNT(*) FROM public.sales s
   WHERE s.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
     AND s.deleted_at IS NULL
     AND COALESCE(s.is_cancelled, false) = false
     AND (GREATEST(COALESCE(s.cash_amount, 0), 0)
       + GREATEST(COALESCE(s.card_amount, 0), 0)
       + GREATEST(COALESCE(s.upi_amount, 0), 0)) > 0.005) AS sales_with_pos_tender,
  (SELECT COUNT(*) FROM public.voucher_entries ve
   WHERE ve.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
     AND ve.deleted_at IS NULL
     AND lower(COALESCE(ve.voucher_type, '')) = 'receipt') AS org_receipt_vouchers;

-- =============================================================================
-- 1) End-to-end RPC row count (full party balance scan, no p_search)
-- =============================================================================
SELECT COUNT(*) AS party_balance_rows
FROM public.get_customer_party_balances(
  '4bc73037-e877-4123-9261-eb6e3876698c'::uuid,
  NULL
);

-- =============================================================================
-- 2a) LEGACY paid_at_sale_drift — plan only (does NOT execute; safe in editor)
--     Correlated ve subquery per sale — do NOT use EXPLAIN ANALYZE on full org.
-- =============================================================================
EXPLAIN
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

-- =============================================================================
-- 2b) CURRENT RPC shape (20260920113000+): group receipts once, join to sales
--     EXPLAIN only first; if fast enough, try EXPLAIN (ANALYZE, BUFFERS) on this block.
-- =============================================================================
EXPLAIN
WITH sale_voucher_receipts AS (
  SELECT
    trim(COALESCE(ve.reference_id::text, '')) AS sale_ref_trim,
    COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ), 0)::numeric AS amt
  FROM public.voucher_entries ve
  WHERE ve.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND trim(COALESCE(ve.reference_id::text, '')) <> ''
  GROUP BY trim(COALESCE(ve.reference_id::text, ''))
)
SELECT s.customer_id, SUM(GREATEST(
  0::numeric,
  GREATEST(COALESCE(s.cash_amount, 0), 0)
    + GREATEST(COALESCE(s.card_amount, 0), 0)
    + GREATEST(COALESCE(s.upi_amount, 0), 0)
  - COALESCE(svr.amt, 0)
)) AS drift_total
FROM public.sales s
LEFT JOIN sale_voucher_receipts svr ON svr.sale_ref_trim = trim(s.id::text)
WHERE s.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
  AND s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND (
    GREATEST(COALESCE(s.cash_amount, 0), 0)
    + GREATEST(COALESCE(s.card_amount, 0), 0)
    + GREATEST(COALESCE(s.upi_amount, 0), 0)
  ) > 0.005
GROUP BY s.customer_id;

-- =============================================================================
-- 2c) Sampled timing — 50 recent tender sales, uuid join on ve.reference_id
--     (Skip ANALYZE if editor returns "Server error"; use 2d for a 5-sale smoke test.)
-- =============================================================================
EXPLAIN (ANALYZE, BUFFERS)
WITH sample_sales AS (
  SELECT s.id, s.customer_id, s.cash_amount, s.card_amount, s.upi_amount
  FROM public.sales s
  WHERE s.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND (
      GREATEST(COALESCE(s.cash_amount, 0), 0)
      + GREATEST(COALESCE(s.card_amount, 0), 0)
      + GREATEST(COALESCE(s.upi_amount, 0), 0)
    ) > 0.005
  ORDER BY s.sale_date DESC
  LIMIT 50
),
receipts_for_sample AS (
  SELECT
    ve.reference_id AS sale_id,
    COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ), 0)::numeric AS amt
  FROM public.voucher_entries ve
  INNER JOIN sample_sales ss ON ss.id = ve.reference_id
  WHERE ve.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
  GROUP BY ve.reference_id
)
SELECT ss.customer_id, SUM(GREATEST(
  0::numeric,
  GREATEST(COALESCE(ss.cash_amount, 0), 0)
    + GREATEST(COALESCE(ss.card_amount, 0), 0)
    + GREATEST(COALESCE(ss.upi_amount, 0), 0)
  - COALESCE(rfs.amt, 0)
)) AS drift_total
FROM sample_sales ss
LEFT JOIN receipts_for_sample rfs ON rfs.sale_id = ss.id
GROUP BY ss.customer_id;

-- =============================================================================
-- 2d) Tiny smoke (should always succeed) — 5 sales, no ANALYZE
-- =============================================================================
WITH sample_sales AS (
  SELECT s.id, s.customer_id, s.cash_amount, s.card_amount, s.upi_amount
  FROM public.sales s
  WHERE s.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'::uuid
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
  ORDER BY s.sale_date DESC
  LIMIT 5
)
SELECT COUNT(*) AS sample_sale_rows FROM sample_sales;

-- =============================================================================
-- 3) After deploying 20260920113000+: wrapper has p_search (2 args)
-- =============================================================================
SELECT
  p.pronargs AS arg_count,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'get_customer_party_balances';

-- =============================================================================
-- 4) RPC with search narrow (mirrors Customer Ledger typeahead — should be fast)
-- =============================================================================
SELECT COUNT(*) AS rows_for_search
FROM public.get_customer_party_balances(
  '4bc73037-e877-4123-9261-eb6e3876698c'::uuid,
  'a'
);
