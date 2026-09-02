-- Phase 2 — EXPLAIN before/after for dashboard summary RPCs.
-- Run in SQL editor as a member of p_org (security invoker view) AND as postgres
-- for the SECURITY DEFINER RPC. Replace the org UUID. Read-only.
-- SET statement_timeout = '15s';

-- BEFORE (view — RLS invoker; membership subquery may not push through GROUP BY)
EXPLAIN (ANALYZE, BUFFERS)
SELECT total_stock_qty, total_stock_value, total_sale_value, total_variant_count
FROM public.v_dashboard_stock_summary
WHERE organization_id = '00000000-0000-0000-0000-000000000000';

EXPLAIN (ANALYZE, BUFFERS)
SELECT purchase_day, total_purchase_amount
FROM public.v_dashboard_purchase_summary
WHERE organization_id = '00000000-0000-0000-0000-000000000000'
  AND purchase_day >= CURRENT_DATE - 7;

-- AFTER (RPC — org predicate inside SECURITY DEFINER)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.get_dashboard_stock_summary('00000000-0000-0000-0000-000000000000');

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.get_dashboard_purchase_summary(
  '00000000-0000-0000-0000-000000000000',
  (CURRENT_DATE - 7)
);

-- Re-rank slow statements (same window as prior audits; do not reset)
SELECT
  LEFT(regexp_replace(query, '\s+', ' ', 'g'), 160) AS query_preview,
  calls,
  ROUND(mean_exec_time::numeric, 2) AS mean_ms,
  ROUND(max_exec_time::numeric, 1) AS max_ms,
  ROUND(total_exec_time::numeric / 1000, 1) AS total_s
FROM pg_stat_statements
WHERE query ILIKE '%v_dashboard_stock_summary%'
   OR query ILIKE '%v_dashboard_purchase_summary%'
   OR query ILIKE '%get_dashboard_stock_summary%'
   OR query ILIKE '%get_dashboard_purchase_summary%'
ORDER BY total_exec_time DESC;
