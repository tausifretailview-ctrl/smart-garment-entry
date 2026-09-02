-- Phase 5 — re-sample Appendix B. Paste this ENTIRE file and Run.
-- Do NOT DROP. Do NOT pg_stat_statements_reset().
-- Both sides of every pair are hot (2026-09-02). Keep all eight.

SELECT
  indexrelname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
WHERE indexrelname IN (
  'idx_sale_items_sale',
  'idx_sale_items_saleid',
  'idx_purchase_items_bill',
  'idx_purchase_items_billid',
  'idx_purchase_items_sku',
  'idx_purchase_items_sku_id',
  'idx_product_variants_org',
  'idx_product_variants_organization_id'
)
ORDER BY indexrelname;
