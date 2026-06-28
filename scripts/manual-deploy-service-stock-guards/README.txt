Service product stock guards — manual deploy (Lovable SQL editor)
================================================================

Run each file IN ORDER in the Supabase/Lovable SQL editor (one at a time).
Wait for "Success" before running the next.

  01_update_stock_on_purchase.sql
  02_handle_purchase_item_update.sql
  03_handle_purchase_item_delete.sql
  04_deduct_stock_on_purchase_return.sql
  05_handle_purchase_return_item_delete.sql
  06_update_stock_on_sale.sql
  07_handle_sale_item_update.sql
  08_handle_sale_item_delete.sql
  09_restore_stock_on_sale_return.sql
  10_handle_sale_return_item_delete.sql
  11_update_stock_on_challan.sql
  12_handle_challan_item_delete.sql
  13_apply_bulk_purchase_insert_effects.sql

Verify all 13 applied:

  SELECT proname, prosrc LIKE '%Service product guard%' AS has_guard
  FROM pg_proc
  WHERE proname IN (
    'update_stock_on_purchase',
    'handle_purchase_item_update',
    'handle_purchase_item_delete',
    'deduct_stock_on_purchase_return',
    'handle_purchase_return_item_delete',
    'update_stock_on_sale',
    'handle_sale_item_update',
    'handle_sale_item_delete',
    'restore_stock_on_sale_return',
    'handle_sale_return_item_delete',
    'update_stock_on_challan',
    'handle_challan_item_delete',
    '_apply_bulk_purchase_insert_effects'
  )
  ORDER BY proname;

Expected: 13 rows, all has_guard = true.

Canonical source: supabase/migrations/20260928140000_service_product_stock_guards.sql
