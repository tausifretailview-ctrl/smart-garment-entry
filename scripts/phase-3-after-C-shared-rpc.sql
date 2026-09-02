-- Phase 3 AFTER migrate ONLY — do not run until 0b lists search_line_item_sale_ids.
-- Needs AUTH 0c first (see scripts/invoice-dashboard-search-invoice-sale-ids-verify.sql).
-- If you see 42883 "function does not exist", the migration is not applied. Stop.

EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.search_line_item_sale_ids(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
  'JEANS'::text,
  CURRENT_DATE - 30,
  CURRENT_DATE,
  1000,
  ARRAY['invoice']::text[]
);
