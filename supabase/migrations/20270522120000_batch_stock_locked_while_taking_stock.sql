-- Batch stock: lock a variant's batches while stock is taken from them (review item D7).
--
-- The functions below take stock from a variant's batches oldest first. They read the batch
-- quantities without a lock and then subtract. When two counters sell the last pieces of the
-- same batch at the same moment, both read "2 left", both take 2, and the batch ends at -2
-- (the second UPDATE waits for the first, then subtracts from the new value). The live
-- database had 45 batches below zero on 23 Nov 2026.
--
-- What this does: in the 6 functions below, the oldest-first batch query gets FOR UPDATE.
-- The second sale then waits for the first, re-reads the batch (now 0, so it is skipped) and
-- takes its pieces from the next batch. Nothing else in the functions changes.
--
-- How: as in 20270517120000, the live definition of each function is read
-- (pg_get_functiondef), only that query is changed, and the function is re-created from that
-- text, so whatever is live is kept (decimal quantities included). A function that is missing,
-- or already locks, is left alone; running this twice changes nothing more.
--
-- No table data is changed. Batches already below zero stay as they are.
DO $patch$
DECLARE
  v_functions constant text[] := ARRAY[
    'update_stock_on_sale',
    'deduct_stock_on_purchase_return',
    'handle_sale_return_item_delete',
    'restore_sale',
    'restore_purchase_return',
    'soft_delete_sale_return'
  ];
  v_fn record;
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
    v_patched := regexp_replace(
      v_live,
      '(FROM\s+(public\.)?batch_stock\s+WHERE\s+variant_id\s*=\s*[A-Za-z_.]+\s+AND\s+quantity\s*>\s*0\s+ORDER\s+BY\s+purchase_date\s+ASC)(\s+LOOP)',
      '\1 FOR UPDATE\3',
      'gi'
    );
    IF v_patched IS DISTINCT FROM v_live THEN
      EXECUTE v_patched;
      v_changed := v_changed + 1;
      RAISE NOTICE 'batch lock: % now locks the batches it takes stock from', v_fn.proname;
    END IF;
  END LOOP;
  RAISE NOTICE 'batch lock: % function(s) changed', v_changed;
END
$patch$;

-- Result: one row per function. Every row should say "locks batches".
SELECT
  f.name AS stock_function,
  CASE
    WHEN p.oid IS NULL THEN 'not on this database'
    WHEN pg_get_functiondef(p.oid) ~* 'FROM\s+(public\.)?batch_stock\s+WHERE\s+variant_id\s*=\s*[A-Za-z_.]+\s+AND\s+quantity\s*>\s*0\s+ORDER\s+BY\s+purchase_date\s+ASC\s+LOOP'
      THEN 'NOT LOCKED'
    WHEN pg_get_functiondef(p.oid) ~* 'ORDER\s+BY\s+purchase_date\s+ASC\s+FOR\s+UPDATE'
      THEN 'locks batches'
    ELSE 'CHECK BY HAND'
  END AS batches
FROM unnest(ARRAY[
  'update_stock_on_sale', 'deduct_stock_on_purchase_return', 'handle_sale_return_item_delete',
  'restore_sale', 'restore_purchase_return', 'soft_delete_sale_return'
]) AS f(name)
LEFT JOIN pg_proc p
  ON p.proname = f.name
 AND p.pronamespace = 'public'::regnamespace
 AND p.prokind = 'f'
ORDER BY f.name;
