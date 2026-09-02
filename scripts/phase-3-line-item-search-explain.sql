-- =============================================================================
-- Phase 3 — EXPLAIN / identity / ranking for org-scoped line-item search
-- =============================================================================
-- Org is hard-coded (ELLA NOOR). Run EACH block separately in the SQL editor.
-- Read-only. Do NOT pg_stat_statements_reset(). SET statement_timeout = '15s'
-- on ANALYZE blocks if you want a hard cap.
--
-- AUTH (required for RPC calls A–D only):
--   Supabase SQL Editor has no JWT → auth.uid() is NULL.
--   Live search_invoice_sale_ids / search_pos_sale_ids call assert_org_member
--   → ERROR 42501 Authentication required (captured 2026-09-02 with dummy
--   UUID 00000000-0000-0000-0000-000000000000). That is the guard working,
--   not a Phase 3 bug.
--   search_line_item_sale_ids does not exist until this PR's migration is
--   applied — do not call it before deploy.
--
-- If 0c fails (no members / claims ignored), use E–G (body-only EXPLAIN) —
-- same JOIN / EXISTS / org-column shapes, no assert_org_member.
--
-- Captured 2026-09-02: identity+ranking were pasted as one script; the RPC
-- 42501 aborted the batch so pg_stat_statements never ran. Run block 0 alone.
-- =============================================================================

-- Org used below (confirm once):
-- SELECT id, name FROM public.organizations
-- WHERE id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid;


-- =============================================================================
-- Block 0 — Re-rank sale_items ILIKE / search RPCs (NO JWT, run this FIRST)
-- =============================================================================
SELECT
  LEFT(regexp_replace(query, '\s+', ' ', 'g'), 160) AS query_preview,
  calls,
  ROUND(mean_exec_time::numeric, 2) AS mean_ms,
  ROUND(max_exec_time::numeric, 1) AS max_ms,
  ROUND(total_exec_time::numeric / 1000, 1) AS total_s
FROM pg_stat_statements
WHERE query ILIKE '%sale_items%'
   OR query ILIKE '%search_line_item_sale_ids%'
   OR query ILIKE '%search_invoice_sale_ids%'
   OR query ILIKE '%search_pos_sale_ids%'
ORDER BY total_exec_time DESC
LIMIT 20;


-- =============================================================================
-- Block 0b — Is the Phase 3 RPC on this database yet? (NO JWT)
-- Expect 0 rows BEFORE migrate, 1 row AFTER.
-- =============================================================================
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'search_line_item_sale_ids',
    'search_invoice_sale_ids',
    'search_pos_sale_ids'
  )
ORDER BY 1, 2;


-- =============================================================================
-- Block 0c — Impersonate an org member (run ONCE before A–D)
-- Expect a non-null uuid from auth.uid(). If NULL, skip A–D and use E–G.
-- =============================================================================
SELECT om.user_id, om.role
FROM public.organization_members om
WHERE om.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
ORDER BY om.created_at
LIMIT 5;

SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (
      SELECT om.user_id::text
      FROM public.organization_members om
      WHERE om.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
      ORDER BY om.created_at
      LIMIT 1
    ),
    'role', 'authenticated'
  )::text,
  true
) AS jwt_claims_set;

SELECT auth.uid() AS impersonated_uid;


-- =============================================================================
-- A–B) BEFORE — live wrappers (need 0c). search_line_item_sale_ids is N/A.
-- Invoice = JOIN from sale_items via sales.organization_id (20261111).
-- POS     = EXISTS-from-sales (20260809) until this migration lands.
-- =============================================================================
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.search_invoice_sale_ids(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
  'JEANS',
  CURRENT_DATE - 30,
  CURRENT_DATE,
  1000
);

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.search_pos_sale_ids(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
  'JEANS',
  CURRENT_DATE - 30,
  CURRENT_DATE,
  500
);


-- =============================================================================
-- C–D) AFTER migrate — shared RPC + identity vs wrappers (need 0c + column)
-- Skip until block 0b shows search_line_item_sale_ids.
-- Expect identity diff_ids = 0 for invoice (JOIN vs JOIN).
-- POS may differ at the per-branch LIMIT edge (EXISTS vs JOIN).
-- =============================================================================
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.search_line_item_sale_ids(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
  'JEANS',
  CURRENT_DATE - 30,
  CURRENT_DATE,
  1000,
  ARRAY['invoice']::text[]
);

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.search_line_item_sale_ids(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
  'JEANS',
  CURRENT_DATE - 30,
  CURRENT_DATE,
  500,
  ARRAY['pos', 'delivery_challan']::text[]
);

SELECT
  (SELECT COUNT(*) FROM public.search_invoice_sale_ids(
     '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
     'JEANS', CURRENT_DATE - 30, CURRENT_DATE, 1000
  )) AS wrapper_n,
  (SELECT COUNT(*) FROM public.search_line_item_sale_ids(
     '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
     'JEANS', CURRENT_DATE - 30, CURRENT_DATE, 1000,
     ARRAY['invoice']::text[]
  )) AS shared_n;


-- =============================================================================
-- E–G) Body-only EXPLAIN — SQL-editor safe (no RPC / no assert_org_member)
-- One representative branch (product_name ILIKE, last 30 days). Enough to
-- compare plan shape: EXISTS vs JOIN-via-sales vs JOIN-via-si.organization_id.
-- =============================================================================

-- E) BEFORE invoice shape — JOIN sale_items → sales, filter sales.organization_id
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT s.id AS sale_id
FROM public.sale_items si
INNER JOIN public.sales s ON s.id = si.sale_id
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_type = 'invoice'
  AND s.deleted_at IS NULL
  AND si.deleted_at IS NULL
  AND s.sale_date >= CURRENT_DATE - 30
  AND s.sale_date <= CURRENT_DATE
  AND si.product_name ILIKE '%JEANS%'
LIMIT 1000;

-- F) BEFORE POS shape — EXISTS-from-sales (live search_pos_sale_ids)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT s.id AS sale_id
FROM public.sales s
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_type IN ('pos', 'delivery_challan')
  AND s.deleted_at IS NULL
  AND s.sale_date >= CURRENT_DATE - 30
  AND s.sale_date <= CURRENT_DATE
  AND EXISTS (
    SELECT 1 FROM public.sale_items si
    WHERE si.sale_id = s.id
      AND si.deleted_at IS NULL
      AND si.product_name ILIKE '%JEANS%'
  )
LIMIT 500;

-- G) AFTER shape — si.organization_id = org (column exists only after migrate)
-- Skip if: SELECT 1 FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='sale_items'
--     AND column_name='organization_id'  → 0 rows
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT s.id AS sale_id
FROM public.sale_items si
INNER JOIN public.sales s ON s.id = si.sale_id
WHERE si.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_type = 'invoice'
  AND s.deleted_at IS NULL
  AND si.deleted_at IS NULL
  AND s.sale_date >= CURRENT_DATE - 30
  AND s.sale_date <= CURRENT_DATE
  AND si.product_name ILIKE '%JEANS%'
LIMIT 1000;
