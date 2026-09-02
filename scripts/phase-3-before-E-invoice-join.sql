-- Phase 3 BEFORE migrate — paste this entire file and Run.
-- Body-only EXPLAIN of live invoice search (JOIN via sales.organization_id).
-- No RPC, no JWT. ELLA NOOR / JEANS / last 30 days.
-- Save the QUERY PLAN text.

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
