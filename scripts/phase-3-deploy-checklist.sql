-- =============================================================================
-- Phase 3 deploy checklist — sale_items.organization_id + search_line_item_sale_ids
-- Migration file: supabase/migrations/20261130120000_sale_items_org_search_rpc.sql
-- (fixed backfill — join sales inside picked CTE; no 42P01)
-- =============================================================================
-- GitHub Step 1 is DONE (PR #599 / a2fe66347 on main).
-- This file is for Supabase SQL Editor only — do NOT paste the .md playbook.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A) PREFLIGHT catalog (run first; decide whether to paste the full migration)
-- -----------------------------------------------------------------------------
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'sale_items'
      AND column_name = 'organization_id'
  ) AS phase3_sale_items_org_col,
  EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'search_line_item_sale_ids'
  ) AS phase3_search_rpc,
  (
    SELECT COUNT(*) FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'search_line_item_sale_ids',
        'search_invoice_sale_ids',
        'search_pos_sale_ids'
      )
  ) AS search_rpc_count;

-- Expect before deploy (known rolled-back state): org_col false, rpc false, count may be 2 (wrappers only).
-- Expect after deploy: org_col true, rpc true, search_rpc_count = 3.

-- -----------------------------------------------------------------------------
-- B) DEPLOY
-- Paste the ENTIRE contents of:
--   supabase/migrations/20261130120000_sale_items_org_search_rpc.sql
-- into a new SQL Editor tab and Run.
-- Takes longer than a schema-only migration (batched backfill).
-- Watch Messages for:
--   NOTICE: sale_items org backfill: items=… matched=… nulls=0 mismatch=0 orphans=0
-- If RAISE EXCEPTION instead — stop; investigate nulls/mismatch/orphans. Do not weaken NOT NULL.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- C) POST — RPC exists (Step 3)
-- -----------------------------------------------------------------------------
SELECT proname, pronargs
FROM pg_proc
WHERE proname = 'search_line_item_sale_ids';
-- Expect: one row.

SELECT proname, pronargs
FROM pg_proc
WHERE proname IN ('search_line_item_sale_ids', 'search_invoice_sale_ids', 'search_pos_sale_ids')
ORDER BY 1;
-- Expect: three rows.

-- -----------------------------------------------------------------------------
-- D) POST — column / nulls / FK / indexes
-- -----------------------------------------------------------------------------
SELECT
  COUNT(*) AS items,
  COUNT(*) FILTER (WHERE organization_id IS NULL) AS null_org,
  COUNT(*) FILTER (
    WHERE organization_id IS DISTINCT FROM (
      SELECT s.organization_id FROM public.sales s WHERE s.id = si.sale_id
    )
  ) AS mismatch
FROM public.sale_items si;
-- Expect: null_org = 0, mismatch = 0.

SELECT indexname
FROM pg_indexes
WHERE tablename = 'sale_items'
  AND indexname LIKE 'idx_sale_items_org%'
ORDER BY 1;
-- Expect: idx_sale_items_organization_id + four org+trgm indexes.

-- -----------------------------------------------------------------------------
-- E) POST — smoke (service_role / SQL editor can call SECURITY DEFINER;
--     authenticated JWT required for real org membership checks in app)
-- ELLA NOOR sample — expect 0+ rows, must not 57014 / 42P01 / 42883:
-- -----------------------------------------------------------------------------
-- SELECT * FROM public.search_line_item_sale_ids(
--   '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
--   'JEANS',
--   (CURRENT_DATE - 30),
--   CURRENT_DATE,
--   50,
--   ARRAY['invoice']::text[]
-- );

-- -----------------------------------------------------------------------------
-- F) AFTER (app): POS search, Sales dashboard search, command palette —
-- same hits as before for a few known terms. Watch for new 57014 timeouts.
-- Re-run scripts/phase-3-before-00-ranking.sql after traffic accumulates;
-- sale_items ILIKE pgrst_source total time should drop sharply.
-- -----------------------------------------------------------------------------
