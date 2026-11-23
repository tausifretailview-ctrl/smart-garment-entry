-- Bill total quantity: worked out once per save, not once per line.
--
-- sales.total_qty was kept by a row trigger on sale_items (trg_update_sale_total_qty): for
-- every line inserted, changed or deleted it summed all the bill's lines again and rewrote
-- the bill row. A 100-line bill meant 100 sums over a growing list and 100 rewrites of the
-- same bill row (each one also runs the bill's own update triggers), so large bills took
-- seconds to save (review item D9).
--
-- Now three statement triggers do the same job once per insert / update / delete: they take
-- the bills the statement touched (from its transition tables), sum each bill's lines once,
-- and write total_qty only where it actually changed. The bill saves (one insert of all
-- lines) therefore rewrite the bill row once. The value is the same as before: the sum of
-- the bill's lines that are not deleted.
--
-- The old trigger is dropped; its function is left in place. Undo:
--   DROP TRIGGER IF EXISTS trg_sale_total_qty_ins ON public.sale_items;
--   DROP TRIGGER IF EXISTS trg_sale_total_qty_upd ON public.sale_items;
--   DROP TRIGGER IF EXISTS trg_sale_total_qty_del ON public.sale_items;
--   CREATE TRIGGER trg_update_sale_total_qty AFTER INSERT OR DELETE OR UPDATE OF quantity, deleted_at, sale_id
--     ON public.sale_items FOR EACH ROW EXECUTE FUNCTION public.update_sale_total_qty();
--
-- No table data is changed by running this. Safe to run twice. Takes a brief lock on
-- sale_items while the triggers are swapped: run it at a quiet time.

CREATE OR REPLACE FUNCTION public.sync_sale_total_qty_for_statement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.sales s
    SET total_qty = t.qty
    FROM (
      SELECT ids.sale_id,
             COALESCE((SELECT SUM(si.quantity)::numeric FROM public.sale_items si
                       WHERE si.sale_id = ids.sale_id AND si.deleted_at IS NULL), 0) AS qty
      FROM (SELECT DISTINCT sale_id FROM new_rows WHERE sale_id IS NOT NULL) ids
    ) t
    WHERE s.id = t.sale_id
      AND s.total_qty IS DISTINCT FROM t.qty;

  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.sales s
    SET total_qty = t.qty
    FROM (
      SELECT ids.sale_id,
             COALESCE((SELECT SUM(si.quantity)::numeric FROM public.sale_items si
                       WHERE si.sale_id = ids.sale_id AND si.deleted_at IS NULL), 0) AS qty
      FROM (SELECT DISTINCT sale_id FROM old_rows WHERE sale_id IS NOT NULL) ids
    ) t
    WHERE s.id = t.sale_id
      AND s.total_qty IS DISTINCT FROM t.qty;

  ELSE -- UPDATE: only lines whose quantity, deleted mark or bill changed (old and new bill)
    UPDATE public.sales s
    SET total_qty = t.qty
    FROM (
      SELECT ids.sale_id,
             COALESCE((SELECT SUM(si.quantity)::numeric FROM public.sale_items si
                       WHERE si.sale_id = ids.sale_id AND si.deleted_at IS NULL), 0) AS qty
      FROM (
        SELECT o.sale_id FROM old_rows o JOIN new_rows n ON n.id = o.id
        WHERE o.quantity IS DISTINCT FROM n.quantity
           OR o.deleted_at IS DISTINCT FROM n.deleted_at
           OR o.sale_id IS DISTINCT FROM n.sale_id
        UNION
        SELECT n.sale_id FROM old_rows o JOIN new_rows n ON n.id = o.id
        WHERE o.quantity IS DISTINCT FROM n.quantity
           OR o.deleted_at IS DISTINCT FROM n.deleted_at
           OR o.sale_id IS DISTINCT FROM n.sale_id
      ) ids
      WHERE ids.sale_id IS NOT NULL
    ) t
    WHERE s.id = t.sale_id
      AND s.total_qty IS DISTINCT FROM t.qty;
  END IF;
  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.sync_sale_total_qty_for_statement() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_update_sale_total_qty ON public.sale_items;
DROP TRIGGER IF EXISTS trg_sale_total_qty_ins ON public.sale_items;
DROP TRIGGER IF EXISTS trg_sale_total_qty_upd ON public.sale_items;
DROP TRIGGER IF EXISTS trg_sale_total_qty_del ON public.sale_items;

CREATE TRIGGER trg_sale_total_qty_ins
  AFTER INSERT ON public.sale_items
  REFERENCING NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.sync_sale_total_qty_for_statement();

CREATE TRIGGER trg_sale_total_qty_upd
  AFTER UPDATE ON public.sale_items
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.sync_sale_total_qty_for_statement();

CREATE TRIGGER trg_sale_total_qty_del
  AFTER DELETE ON public.sale_items
  REFERENCING OLD TABLE AS old_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.sync_sale_total_qty_for_statement();

-- Result: the three new triggers, and no old one. Expect 3 rows, all "on".
SELECT t.tgname AS trigger_name,
       CASE t.tgenabled WHEN 'D' THEN 'off' ELSE 'on' END AS state
FROM pg_trigger t
WHERE t.tgrelid = 'public.sale_items'::regclass
  AND NOT t.tgisinternal
  AND t.tgname IN ('trg_update_sale_total_qty', 'trg_sale_total_qty_ins', 'trg_sale_total_qty_upd', 'trg_sale_total_qty_del')
ORDER BY t.tgname;
