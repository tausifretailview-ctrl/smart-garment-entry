-- =============================================================================
-- Receipt guard live status — since 2026-09-18 20:10:54 UTC (Lovable go-live)
-- READ ONLY. Paste this entire file as ONE run. Do not click Format SQL first.
-- Do not DROP the trigger or unique index. Do not mutate money rows.
-- =============================================================================

-- A. Guard still installed (column + unique index + trigger)
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'voucher_entries'
      AND column_name = 'client_request_id'
  ) AS column_live,
  EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'uq_voucher_entries_client_request_active'
  ) AS unique_index_live,
  EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_enforce_receipt_within_invoice_cap'
      AND tgenabled <> 'D'
  ) AS trigger_live_and_enabled;

-- B. Successful receipts since go-live — genuine payments are flowing
--    (a reject leaves NO row, so this is the accept path only)
SELECT
  COUNT(*) AS receipts_since_golive,
  COUNT(*) FILTER (WHERE ve.client_request_id IS NOT NULL) AS with_submit_key,
  COUNT(*) FILTER (WHERE ve.client_request_id IS NULL) AS without_submit_key,
  COUNT(DISTINCT ve.organization_id) AS orgs,
  MIN(ve.created_at) AS first_at,
  MAX(ve.created_at) AS last_at
FROM public.voucher_entries ve
WHERE ve.deleted_at IS NULL
  AND LOWER(COALESCE(ve.voucher_type, '')) = 'receipt'
  AND ve.created_at >= TIMESTAMPTZ '2026-09-18 20:10:54+00';

-- C. NEW already-zero POS-template duplicates since go-live
--    remaining_before <= 0.5 = the leak the guard is meant to stop.
--    Zero rows = holding. Any row = a leak after go-live.
SELECT
  ve.organization_id,
  ve.voucher_number,
  ve.created_at,
  ve.total_amount,
  ve.client_request_id,
  ve.description,
  s.sale_number,
  s.net_amount,
  GREATEST(
    COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0)
    - COALESCE(prior.receipt_sum, 0)
    - GREATEST(
        COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0)
        - COALESCE(same_day.receipt_sum, 0),
        0
      ),
    0
  ) AS remaining_before
FROM public.voucher_entries ve
JOIN public.sales s
  ON s.id = ve.reference_id
 AND s.organization_id = ve.organization_id
 AND s.deleted_at IS NULL
LEFT JOIN LATERAL (
  SELECT SUM(COALESCE(p.total_amount, 0) + COALESCE(p.discount_amount, 0)) AS receipt_sum
  FROM public.voucher_entries p
  WHERE p.organization_id = ve.organization_id
    AND p.reference_id = ve.reference_id
    AND p.deleted_at IS NULL
    AND LOWER(COALESCE(p.voucher_type, '')) = 'receipt'
    AND COALESCE(p.payment_method, '') IS DISTINCT FROM 'credit_note_adjustment'
    AND p.created_at < ve.created_at
) prior ON TRUE
LEFT JOIN LATERAL (
  SELECT SUM(COALESCE(p.total_amount, 0) + COALESCE(p.discount_amount, 0)) AS receipt_sum
  FROM public.voucher_entries p
  WHERE p.organization_id = ve.organization_id
    AND p.reference_id = ve.reference_id
    AND p.deleted_at IS NULL
    AND LOWER(COALESCE(p.voucher_type, '')) = 'receipt'
    AND COALESCE(p.payment_method, '') IS DISTINCT FROM 'credit_note_adjustment'
    AND p.created_at < ve.created_at
    AND p.voucher_date IS NOT DISTINCT FROM (s.sale_date AT TIME ZONE 'Asia/Kolkata')::date
) same_day ON TRUE
WHERE ve.deleted_at IS NULL
  AND LOWER(COALESCE(ve.voucher_type, '')) = 'receipt'
  AND ve.created_at >= TIMESTAMPTZ '2026-09-18 20:10:54+00'
  AND COALESCE(ve.payment_method, '') IS DISTINCT FROM 'credit_note_adjustment'
  AND (
    ve.description ILIKE 'Payment for POS%'
    OR ve.description ILIKE 'Payment received for POS sale%'
    OR ve.reference_type IN ('sale', 'SALE', 'CustomerReceipt')
  )
  AND GREATEST(
    COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0)
    - COALESCE(prior.receipt_sum, 0)
    - GREATEST(
        COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0)
        - COALESCE(same_day.receipt_sum, 0),
        0
      ),
    0
  ) <= 0.5
ORDER BY ve.created_at, ve.voucher_number;

-- D. Same-submit key reused (unique index should make this 0)
SELECT
  ve.organization_id,
  ve.client_request_id,
  COUNT(*) AS rows
FROM public.voucher_entries ve
WHERE ve.deleted_at IS NULL
  AND ve.client_request_id IS NOT NULL
  AND ve.created_at >= TIMESTAMPTZ '2026-09-18 20:10:54+00'
GROUP BY 1, 2
HAVING COUNT(*) > 1
ORDER BY rows DESC;

-- E. Optional: function-call counter (only filled if track_functions is on).
--    Does NOT prove a reject — every voucher INSERT calls the trigger.
--    trigger_calls comes from pg_stat_user_functions; stats_reset_at from
--    pg_stat_database. pg_proc has neither column.
SELECT
  proc.proname AS function_name,
  fn_stats.calls AS trigger_calls,
  db_stats.stats_reset AS stats_reset_at
FROM pg_catalog.pg_proc AS proc
LEFT JOIN pg_catalog.pg_stat_user_functions AS fn_stats
  ON fn_stats.funcid = proc.oid
LEFT JOIN pg_catalog.pg_stat_database AS db_stats
  ON db_stats.datname = current_database()
WHERE proc.proname = 'enforce_receipt_within_invoice_cap'
  AND proc.pronamespace = 'public'::regnamespace;
