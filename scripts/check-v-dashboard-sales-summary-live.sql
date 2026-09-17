-- =============================================================================
-- Bug A live check: is v_dashboard_sales_summary still using SUM(DISTINCT)?
-- Run in Supabase SQL editor (postgres / service role). READ-ONLY.
--
-- NOT_FIXED: definition still contains DISTINCT on money columns.
-- FIXED:     plain SUM(net_amount), qty pre-aggregated per sale_id
--            (migration 20261025120000_fix_v_dashboard_sales_summary_no_distinct.sql).
--
-- A row in schema_migrations is NOT proof the view body matches — always
-- read pg_get_viewdef. Merged ≠ deployed.
-- =============================================================================

SELECT
  CASE
    WHEN pg_get_viewdef('public.v_dashboard_sales_summary'::regclass, true)
         ILIKE '%sum(DISTINCT%'
      OR pg_get_viewdef('public.v_dashboard_sales_summary'::regclass, true)
         ILIKE '%sum( DISTINCT%'
      THEN 'NOT_FIXED — still SUM(DISTINCT)'
    WHEN pg_get_viewdef('public.v_dashboard_sales_summary'::regclass, true)
         ILIKE '%SUM(s.net_amount)%'
      THEN 'LIKELY_FIXED — plain SUM(net_amount)'
    ELSE 'UNKNOWN — inspect view_definition'
  END AS status,
  EXISTS (
    SELECT 1
    FROM supabase_migrations.schema_migrations
    WHERE version = '20261025120000'
  ) AS schema_migrations_has_20261025120000,
  pg_get_viewdef('public.v_dashboard_sales_summary'::regclass, true) AS view_definition;
