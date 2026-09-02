-- Phase 3 — EXPLAIN before/after for org-scoped line-item search.
-- Run in SQL editor as a member of the org (RPC auth.role() guard).
-- Replace the org UUID. Read-only. Do not pg_stat_statements_reset().
-- SET statement_timeout = '15s';

-- BEFORE (current wrappers / live shape — invoice JOIN from sale_items via sales.organization_id)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.search_invoice_sale_ids(
  '00000000-0000-0000-0000-000000000000',
  'JEANS',
  CURRENT_DATE - 30,
  CURRENT_DATE,
  1000
);

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.search_pos_sale_ids(
  '00000000-0000-0000-0000-000000000000',
  'JEANS',
  CURRENT_DATE - 30,
  CURRENT_DATE,
  500
);

-- AFTER (shared RPC; si.organization_id = p_org_id)
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.search_line_item_sale_ids(
  '00000000-0000-0000-0000-000000000000',
  'JEANS',
  CURRENT_DATE - 30,
  CURRENT_DATE,
  1000,
  ARRAY['invoice']::text[]
);

EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM public.search_line_item_sale_ids(
  '00000000-0000-0000-0000-000000000000',
  'JEANS',
  CURRENT_DATE - 30,
  CURRENT_DATE,
  500,
  ARRAY['pos', 'delivery_challan']::text[]
);

-- Result-set identity vs wrappers (expect diff_ids = 0)
SELECT
  (SELECT COUNT(*) FROM public.search_invoice_sale_ids(
     '00000000-0000-0000-0000-000000000000', 'JEANS', CURRENT_DATE - 30, CURRENT_DATE, 1000
  )) AS wrapper_n,
  (SELECT COUNT(*) FROM public.search_line_item_sale_ids(
     '00000000-0000-0000-0000-000000000000', 'JEANS', CURRENT_DATE - 30, CURRENT_DATE, 1000,
     ARRAY['invoice']::text[]
  )) AS shared_n;

-- Re-rank sale_items ILIKE / search RPCs (do not reset)
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
