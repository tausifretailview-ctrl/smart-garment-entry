-- Speed-programme catalog check. Paste this entire file and Run.
-- One statement. Do not paste Markdown. Do not pg_stat_statements_reset().
-- false / empty = not on production yet.
--
-- Captured 2026-09-03 11:21 (query-results-export-2026-09-03_11-21-32_6120.csv):
--   phase2_stock_rpc=true  phase7_stock_qty_body=true
--   phase2_purchase_rpc=false
--   phase3_sale_items_org_col=false  phase3_search_rpc=false
--   phase4_products_name_trgm=false  phase4_purchase_barcode=false
--   phase4_purchase_barcode_trgm=false
-- Still to apply: scripts/phase-2-purchase-summary-only.sql,
--   supabase/migrations/20261130120000_sale_items_org_search_rpc.sql,
--   supabase/migrations/20261201120000_phase4_search_shape_indexes.sql
-- Do NOT re-apply the Phase 2 stock function (would revert Phase 7 to current_stock).

SELECT
  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_dashboard_stock_summary'
      AND pg_get_function_identity_arguments(p.oid) = 'p_org_id uuid'
  ) AS phase2_stock_rpc,

  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_dashboard_purchase_summary'
      AND pg_get_function_identity_arguments(p.oid) = 'p_org_id uuid, p_from_day date'
  ) AS phase2_purchase_rpc,

  COALESCE((
    SELECT pg_get_functiondef(p.oid) LIKE '%SUM(pv.stock_qty)%'
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_dashboard_stock_summary'
      AND pg_get_function_identity_arguments(p.oid) = 'p_org_id uuid'
    LIMIT 1
  ), false) AS phase7_stock_qty_body,

  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sale_items'
      AND column_name = 'organization_id'
  ) AS phase3_sale_items_org_col,

  EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'search_line_item_sale_ids'
  ) AS phase3_search_rpc,

  EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_products_org_name_trgm'
  ) AS phase4_products_name_trgm,

  EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_purchase_items_barcode'
  ) AS phase4_purchase_barcode,

  EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'idx_purchase_items_barcode_trgm'
  ) AS phase4_purchase_barcode_trgm;
