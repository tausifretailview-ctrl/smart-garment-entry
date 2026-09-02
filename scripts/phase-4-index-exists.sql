-- Phase 4 — confirm indexes exist. Paste this entire file and Run.
-- Do not paste Markdown. Do not pg_stat_statements_reset().

SELECT indexrelname, pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE indexrelname IN (
  'idx_products_org_name_trgm',
  'idx_purchase_items_barcode',
  'idx_purchase_items_barcode_trgm',
  'idx_products_org_brand_trgm',
  'idx_products_org_style_trgm',
  'idx_products_org_category_trgm'
)
ORDER BY indexrelname;
