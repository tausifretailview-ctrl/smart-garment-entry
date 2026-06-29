VELVET service stock cleanup — manual deploy (run AFTER Step 1 guards verified)
================================================================================

Org: dafc3d0c-874e-4784-bac3-5eab5f3c85b5 (VELVET POS)

Run files IN ORDER in SQL editor:

  01_add_stock_movements_deleted_at.sql   (skip if column already exists)
  02_reset_service_variant_stock.sql
  03_soft_delete_service_movements.sql
  04_delete_service_batch_stock.sql

Verify:

  SELECT pv.barcode, pv.stock_qty, p.product_name
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'
    AND p.product_type = 'service'
    AND pv.deleted_at IS NULL;

Expected: stock_qty = 0 for ACCESSORIES, HAIR CLIPS, DC TOPS.

Canonical: supabase/migrations/20260929120000_velvet_service_stock_cleanup.sql
