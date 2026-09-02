-- Phase 3 AFTER migrate ONLY — sale_items.organization_id must exist.
-- If you see 42703 "column si.organization_id does not exist", stop.
-- Body-only EXPLAIN (no RPC). ELLA NOOR / JEANS / last 30 days.

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
