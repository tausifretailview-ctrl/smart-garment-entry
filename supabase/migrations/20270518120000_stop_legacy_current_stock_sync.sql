-- Stop rewriting the old stock column product_variants.current_stock on every stock movement.
--
-- The real stock figure is product_variants.stock_qty. current_stock is an older copy kept
-- in step by a trigger on stock_movements (sync_variant_current_stock): every sale line,
-- return and purchase line wrote it again. It no longer matches stock_qty (117,205 items
-- differed on the live database on 23 Nov 2026), and reports read stock_qty. The extra
-- write on every movement is work for nothing (review item D5).
--
-- What this does:
--   1. Checks that no database function (other than the sync itself) and no view reads
--      current_stock. If any does, it lists them and changes NOTHING.
--   2. Otherwise it switches the sync trigger off. The column and its values stay as they
--      are; nothing is deleted. The app only falls back to current_stock when stock_qty is
--      empty.
--
-- Undo (turns the sync back on):
--   ALTER TABLE public.stock_movements ENABLE TRIGGER <trigger name listed below>;
--
-- Safe to run twice. Takes a brief lock on stock_movements while the trigger is switched
-- off: run it at a quiet time.
DO $stop$
DECLARE
  v_readers text;
  v_trigger record;
  v_switched integer := 0;
BEGIN
  SELECT string_agg(kind || ' ' || name, ', ' ORDER BY kind, name)
  INTO v_readers
  FROM (
    SELECT 'function' AS kind, p.proname::text AS name
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proname <> 'sync_variant_current_stock'
      AND p.prosrc ~* '(pv|product_variants|v|NEW|OLD)\.current_stock'
    UNION ALL
    SELECT 'view', c.relname::text
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('v', 'm')
      AND pg_get_viewdef(c.oid) ~* 'current_stock'
  ) readers;

  IF v_readers IS NOT NULL THEN
    RAISE NOTICE 'current_stock: NOT changed. Still read by: %', v_readers;
    RETURN;
  END IF;

  FOR v_trigger IN
    SELECT t.tgname, t.tgenabled
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.stock_movements'::regclass
      AND NOT t.tgisinternal
      AND p.proname = 'sync_variant_current_stock'
  LOOP
    IF v_trigger.tgenabled <> 'D' THEN
      EXECUTE format('ALTER TABLE public.stock_movements DISABLE TRIGGER %I', v_trigger.tgname);
      v_switched := v_switched + 1;
    END IF;
    RAISE NOTICE 'current_stock: trigger % is off', v_trigger.tgname;
  END LOOP;

  RAISE NOTICE 'current_stock: % trigger(s) switched off now', v_switched;
END
$stop$;

-- Result: one row per sync trigger. "off" means current_stock is no longer rewritten.
-- No rows: the trigger does not exist on this database (nothing to do).
SELECT
  t.tgname AS trigger_name,
  CASE t.tgenabled WHEN 'D' THEN 'off' ELSE 'STILL ON (see the notice: something still reads current_stock)' END AS sync_state
FROM pg_trigger t
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE t.tgrelid = 'public.stock_movements'::regclass
  AND NOT t.tgisinternal
  AND p.proname = 'sync_variant_current_stock';
