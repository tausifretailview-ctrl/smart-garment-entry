-- Phase 1 — Rollback-storm measurement (READ ONLY)
-- Run in Supabase SQL editor as postgres / a role that can read pg_catalog + app_error_logs.
-- One numbered block at a time. Do NOT pg_stat_statements_reset(). Do NOT UPDATE/DELETE.
-- Paste results into docs/phase-1-rollback-storm-2026-09.md §Results.

-- =============================================================================
-- Block 0 — Window, ratio, rate (this is the 4.53 M figure's context)
-- =============================================================================
SELECT
  current_database() AS datname,
  d.xact_commit,
  d.xact_rollback,
  ROUND(
    100.0 * d.xact_rollback / NULLIF(d.xact_commit + d.xact_rollback, 0),
    2
  ) AS rollback_pct,
  d.conflicts,
  d.deadlocks,
  d.temp_files,
  d.stats_reset AS db_stats_reset,
  (SELECT stats_reset FROM pg_stat_statements_info) AS pgss_stats_reset,
  pg_postmaster_start_time() AS postmaster_start,
  now() AS sampled_at,
  ROUND(
    d.xact_rollback
      / GREATEST(EXTRACT(EPOCH FROM (now() - pg_postmaster_start_time())), 1),
    3
  ) AS rollbacks_per_sec_since_boot,
  ROUND(
    d.xact_rollback
      / GREATEST(EXTRACT(EPOCH FROM (now() - COALESCE(d.stats_reset, pg_postmaster_start_time()))), 1),
    3
  ) AS rollbacks_per_sec_since_db_stats_reset
FROM pg_stat_database d
WHERE d.datname = current_database();

-- =============================================================================
-- Block 1 — App-visible errors, 30 days, by operation + SQLSTATE
-- RLS hides this from anon; SQL editor bypasses RLS.
-- logError is authenticated + opt-in per call site — this is a LOWER BOUND.
-- =============================================================================
SELECT
  COALESCE(operation, '(null)') AS operation,
  COALESCE(error_code, '(null)') AS error_code,
  COUNT(*) AS n,
  MIN(created_at) AS first_seen,
  MAX(created_at) AS last_seen,
  LEFT(MIN(error_message), 160) AS sample_message
FROM public.app_error_logs
WHERE created_at >= now() - interval '30 days'
GROUP BY 1, 2
ORDER BY n DESC
LIMIT 40;

-- =============================================================================
-- Block 2 — Constraint / timeout slice (23505, 23514, 57014, 42501)
-- =============================================================================
SELECT
  COALESCE(error_code, '(null)') AS error_code,
  COUNT(*) AS n,
  COUNT(*) FILTER (WHERE error_message ILIKE '%duplicate key%' OR error_code = '23505') AS n_unique,
  COUNT(*) FILTER (
    WHERE error_code = '57014'
       OR error_message ILIKE '%statement timeout%'
       OR error_message ILIKE '%query_canceled%'
  ) AS n_timeout,
  COUNT(*) FILTER (
    WHERE error_code = '23514'
       OR error_message ILIKE '%stock_not_negative%'
       OR error_message ILIKE '%Insufficient stock%'
       OR error_message ILIKE '%PURCHASE_STOCK_FLOOR%'
  ) AS n_stock_guard,
  COUNT(*) FILTER (WHERE error_code = '42501' OR error_message ILIKE '%not authorized%') AS n_authz,
  LEFT(MIN(error_message), 200) AS sample_message
FROM public.app_error_logs
WHERE created_at >= now() - interval '30 days'
  AND (
    error_code IN ('23505', '23514', '57014', '42501', 'P0001', 'P0002')
    OR error_message ILIKE '%duplicate key%'
    OR error_message ILIKE '%statement timeout%'
    OR error_message ILIKE '%Insufficient stock%'
    OR error_message ILIKE '%stock_not_negative%'
    OR error_message ILIKE '%not authorized%'
  )
GROUP BY 1
ORDER BY n DESC;

-- Same slice, by operation (which screen / save path)
SELECT
  COALESCE(operation, '(null)') AS operation,
  COALESCE(error_code, '(null)') AS error_code,
  COUNT(*) AS n
FROM public.app_error_logs
WHERE created_at >= now() - interval '30 days'
  AND (
    error_code IN ('23505', '23514', '57014', '42501')
    OR error_message ILIKE '%duplicate key%'
    OR error_message ILIKE '%statement timeout%'
    OR error_message ILIKE '%Insufficient stock%'
  )
GROUP BY 1, 2
ORDER BY n DESC
LIMIT 30;

-- =============================================================================
-- Block 3 — pg_stat_statements: write shapes by calls
-- Failed statements may be under-counted (extension tracks completed plans).
-- Use Dashboard → Logs → Postgres ERROR for the real rollback histogram.
-- =============================================================================
SELECT
  LEFT(regexp_replace(query, '\s+', ' ', 'g'), 180) AS query_preview,
  calls,
  ROUND(mean_exec_time::numeric, 2) AS mean_ms,
  ROUND(total_exec_time::numeric / 1000, 1) AS total_s,
  rows,
  ROUND((100.0 * shared_blks_hit / NULLIF(shared_blks_hit + shared_blks_read, 0))::numeric, 1) AS hit_pct
FROM pg_stat_statements
WHERE query ILIKE '%INSERT%'
   OR query ILIKE '%UPDATE%'
   OR query ILIKE '%DELETE%'
ORDER BY calls DESC
LIMIT 25;

-- Slow successful statements (re-rank vs phase-0 / phase-3 audits)
SELECT
  LEFT(regexp_replace(query, '\s+', ' ', 'g'), 180) AS query_preview,
  calls,
  ROUND(mean_exec_time::numeric, 2) AS mean_ms,
  ROUND(max_exec_time::numeric, 1) AS max_ms,
  ROUND(total_exec_time::numeric / 1000, 1) AS total_s
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- =============================================================================
-- Block 4 — Hot-table write volume (successful tuples only)
-- Compare n_tup_ins to xact_rollback: if inserts ≪ rollbacks, failures are
-- elsewhere (auth, cron, subxact, internal).
-- =============================================================================
SELECT
  relname,
  n_tup_ins,
  n_tup_upd,
  n_tup_del,
  n_tup_hot_upd,
  seq_scan,
  idx_scan
FROM pg_stat_user_tables
WHERE relname IN (
  'sales', 'sale_items', 'purchase_bills', 'purchase_items',
  'product_variants', 'products', 'voucher_entries', 'journal_entries',
  'customer_advances', 'login_attempts', 'app_error_logs',
  'bill_number_sequences', 'barcode_sequence'
)
ORDER BY n_tup_ins DESC;

-- =============================================================================
-- Block 5 — pg_cron recent run status (failure loops would show here)
-- Skip if cron schema is missing.
-- =============================================================================
SELECT
  j.jobname,
  j.schedule,
  j.command,
  j.active
FROM cron.job j
ORDER BY j.jobname;

SELECT
  d.jobid,
  j.jobname,
  d.status,
  LEFT(COALESCE(d.return_message, ''), 180) AS return_message,
  COUNT(*) AS n,
  MIN(d.start_time) AS first_seen,
  MAX(d.start_time) AS last_seen
FROM cron.job_run_details d
LEFT JOIN cron.job j ON j.jobid = d.jobid
WHERE d.start_time >= now() - interval '14 days'
GROUP BY 1, 2, 3, 4
ORDER BY n DESC
LIMIT 40;

-- =============================================================================
-- Appendix A — Phase 2 BEFORE (optional). security_invoker views.
-- Replace the org UUID. Prefer EXPLAIN without ANALYZE first.
-- ANALYZE runs the aggregate for real; keep statement_timeout modest.
-- =============================================================================
-- SET statement_timeout = '15s';
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT total_stock_qty, total_stock_value, total_sale_value, total_variant_count
-- FROM public.v_dashboard_stock_summary
-- WHERE organization_id = '00000000-0000-0000-0000-000000000000';
--
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT purchase_day, total_purchase_amount
-- FROM public.v_dashboard_purchase_summary
-- WHERE organization_id = '00000000-0000-0000-0000-000000000000'
--   AND purchase_day >= CURRENT_DATE - 7;

-- =============================================================================
-- Appendix B — Phase 5 BEFORE index-scan snapshot (do not DROP here)
-- Partial (deleted_at IS NULL) vs unfiltered pairs — not byte-identical.
-- =============================================================================
SELECT
  indexrelname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE indexrelname IN (
  'idx_sale_items_sale',
  'idx_sale_items_saleid',
  'idx_purchase_items_bill',
  'idx_purchase_items_billid',
  'idx_purchase_items_sku',
  'idx_purchase_items_sku_id',
  'idx_product_variants_org',
  'idx_product_variants_organization_id'
)
ORDER BY indexrelname;
