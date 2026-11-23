-- Stock triggers: keep decimal quantities (metres, kg) instead of rounding them.
--
-- Quantity columns have been NUMERIC(10,3) since 20260410190232, but the stock functions still
-- hold the quantity in INTEGER variables. For a line sold as 1.5:
--   - product_variants.stock_qty goes down by 1.5 (correct),
--   - batch_stock goes down by 2 and the stock movement says 2 (rounded);
-- a line of 0.4 moves no batch and writes no movement at all, and with 0.4 in stock the sale
-- is refused as "Insufficient stock" because the stock is read as 0.
-- Stock history and batch stock therefore drift from the stock figure on every decimal line
-- (review item D4; the live database had 435 such sale lines on 23 Nov 2026).
--
-- What this does: in the 13 functions below, variables that carry a quantity are declared
-- NUMERIC instead of INTEGER. Nothing else in the functions changes.
--
-- How: the live definition of each function is read (pg_get_functiondef), only those
-- declarations are rewritten, and the function is re-created from that text. So whatever is
-- live is kept as it is, including changes that never reached the migration files. A function
-- that is missing, or already NUMERIC, is left alone; running this twice changes nothing more.
--
-- No table data is changed. Whole-piece items behave exactly as before. Movements and batch
-- stock already rounded in the past are not rewritten here.
DO $patch$
DECLARE
  v_functions constant text[] := ARRAY[
    'update_stock_on_sale',
    'handle_sale_item_delete',
    'restore_stock_on_sale_return',
    'handle_sale_return_item_delete',
    'deduct_stock_on_purchase_return',
    'handle_purchase_return_item_delete',
    'handle_purchase_item_update',
    'soft_delete_sale',
    'restore_sale',
    'soft_delete_sale_return',
    'restore_sale_return',
    'soft_delete_purchase_return',
    'restore_purchase_return'
  ];
  -- Only these names, and only where they are declared as a whole number.
  v_quantity_variables constant text[] := ARRAY[
    'v_remaining_qty',
    'v_deduct_qty',
    'v_restore_qty',
    'v_current_stock',
    'v_total_sold',
    'v_total_returned',
    'v_qty_difference',
    'v_qty_restored'
  ];
  v_fn record;
  v_variable text;
  v_live text;
  v_patched text;
  v_changed integer := 0;
BEGIN
  FOR v_fn IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname = ANY (v_functions)
    ORDER BY p.proname
  LOOP
    v_live := pg_get_functiondef(v_fn.oid);
    v_patched := v_live;
    FOREACH v_variable IN ARRAY v_quantity_variables LOOP
      v_patched := regexp_replace(
        v_patched,
        '(\m' || v_variable || '\s+)(integer|int4|int)\M',
        '\1numeric',
        'gi'
      );
    END LOOP;
    IF v_patched IS DISTINCT FROM v_live THEN
      EXECUTE v_patched;
      v_changed := v_changed + 1;
      RAISE NOTICE 'decimal stock: % now keeps decimal quantities', v_fn.proname;
    END IF;
  END LOOP;
  RAISE NOTICE 'decimal stock: % function(s) changed', v_changed;
END
$patch$;

-- Result: one row per function. Every row should say "decimal".
SELECT
  f.name AS stock_function,
  CASE
    WHEN p.oid IS NULL THEN 'not on this database'
    WHEN pg_get_functiondef(p.oid) ~* '\m(v_remaining_qty|v_deduct_qty|v_restore_qty|v_current_stock|v_total_sold|v_total_returned|v_qty_difference|v_qty_restored)\s+(integer|int4|int)\M'
      THEN 'STILL WHOLE NUMBERS'
    ELSE 'decimal'
  END AS quantities
FROM unnest(ARRAY[
  'update_stock_on_sale', 'handle_sale_item_delete', 'restore_stock_on_sale_return',
  'handle_sale_return_item_delete', 'deduct_stock_on_purchase_return',
  'handle_purchase_return_item_delete', 'handle_purchase_item_update', 'soft_delete_sale',
  'restore_sale', 'soft_delete_sale_return', 'restore_sale_return',
  'soft_delete_purchase_return', 'restore_purchase_return'
]) AS f(name)
LEFT JOIN pg_proc p
  ON p.proname = f.name
 AND p.pronamespace = 'public'::regnamespace
 AND p.prokind = 'f'
ORDER BY f.name;
