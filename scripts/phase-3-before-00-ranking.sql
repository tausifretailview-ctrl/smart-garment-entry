-- Phase 3 BEFORE migrate — paste this entire file and Run.
-- No JWT. Do not pg_stat_statements_reset().
-- Export CSV → docs/phase-3-line-item-search-2026-09.md §Block 0.

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
