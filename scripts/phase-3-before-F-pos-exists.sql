-- Phase 3 BEFORE migrate — paste this entire file and Run.
-- Body-only EXPLAIN of live POS search (EXISTS-from-sales).
-- No RPC, no JWT. ELLA NOOR / JEANS / last 30 days.
-- Save the QUERY PLAN text.

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
