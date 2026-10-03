-- Quotations are price documents. Saving one must not change live stock.
-- product_variants.stock_qty is updated by sale, purchase, return, and
-- adjustment triggers only. This drops any trigger on quotations /
-- quotation_items whose function still writes stock_qty, stock_movements,
-- or batch_stock (same rule as delivery challans in 20261002100000).
-- Existing on-hand quantities are left as they are. This is not a stock repair.

DROP TRIGGER IF EXISTS trigger_update_stock_on_quotation ON public.quotation_items;
DROP TRIGGER IF EXISTS trigger_update_stock_on_quotation_item ON public.quotation_items;
DROP TRIGGER IF EXISTS on_quotation_item_insert ON public.quotation_items;
DROP TRIGGER IF EXISTS trigger_handle_quotation_item_delete ON public.quotation_items;
DROP TRIGGER IF EXISTS trigger_quotation_item_delete ON public.quotation_items;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT t.tgname AS trigger_name, c.relname AS table_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND c.relname IN ('quotation_items', 'quotations')
      AND NOT t.tgisinternal
      AND (
        pg_get_functiondef(p.oid) ILIKE '%stock_qty%'
        OR pg_get_functiondef(p.oid) ILIKE '%stock_movements%'
        OR pg_get_functiondef(p.oid) ILIKE '%batch_stock%'
      )
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.trigger_name, r.table_name);
  END LOOP;
END $$;

COMMENT ON TABLE public.quotation_items IS
  'Quotation lines. Insert, update, and delete must not change live stock (product_variants.stock_qty).';
