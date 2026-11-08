-- Industrial mode, Phase 3 step 3d (part 3): a Sale Return goes back into a godown.
--
-- Goods coming in, the mirror of step 3d-1:
--   * The return saves exactly as today, so its goods first come back on Main (shop stock).
--   * Right after the save, Sale Return calls godown_sync_doc('sale_return', return, godown). It moves
--     the returned quantities from Main into the picked godown. An edit moves only the difference;
--     going back to Main takes them out again.
--   * Deleting, restoring or removing a return runs the same sync when the change commits
--     (deferred triggers). They stop at once for returns that never used a godown, and never block.
--
-- Also makes the shared trigger function read is_cancelled only when the table has it
-- (sale_returns has no such column), so one function serves every document.
-- Changes functions from steps 3d-1 / 3d-2 and adds two triggers on sale_returns. No table changes,
-- and nothing runs for shops not using godowns.

DO $$
BEGIN
  IF to_regclass('public.godown_doc_places') IS NULL THEN
    RAISE EXCEPTION 'Run the Phase 3 step 3d SQL first';
  END IF;
END;
$$;

-- 1. A document's header: sales, delivery challans and now sale returns. ----------------------
CREATE OR REPLACE FUNCTION public._godown_doc_head(p_ref_type text, p_doc_id uuid)
RETURNS TABLE (organization_id uuid, doc_no text, doc_date date, active boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.organization_id, s.sale_number, (s.sale_date AT TIME ZONE 'Asia/Kolkata')::date,
         (s.deleted_at IS NULL AND NOT COALESCE(s.is_cancelled, false))
    FROM public.sales s
   WHERE p_ref_type = 'sale' AND s.id = p_doc_id
  UNION ALL
  SELECT c.organization_id, c.challan_number, (c.challan_date AT TIME ZONE 'Asia/Kolkata')::date,
         (c.deleted_at IS NULL AND COALESCE(c.status, '') <> 'cancelled')
    FROM public.delivery_challans c
   WHERE p_ref_type = 'challan' AND c.id = p_doc_id
  UNION ALL
  SELECT r.organization_id, r.return_number, r.return_date, r.deleted_at IS NULL
    FROM public.sale_returns r
   WHERE p_ref_type = 'sale_return' AND r.id = p_doc_id;
$$;

-- 2. A document's stock lines. A sale return adds stock for every item but services. ------------
CREATE OR REPLACE FUNCTION public._godown_doc_lines(p_ref_type text, p_doc_id uuid)
RETURNS TABLE (variant_id uuid, qty numeric, rate numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT si.variant_id, SUM(si.quantity)::numeric,
         MAX(COALESCE(NULLIF(pv.pur_price, 0), p.default_pur_price, 0))::numeric
    FROM public.sale_items si
    JOIN public.product_variants pv ON pv.id = si.variant_id
    JOIN public.products p ON p.id = pv.product_id
   WHERE p_ref_type = 'sale' AND si.sale_id = p_doc_id AND si.deleted_at IS NULL
     AND COALESCE(p.product_type, '') NOT IN ('service', 'combo')
   GROUP BY si.variant_id
  HAVING SUM(si.quantity) > 0
  UNION ALL
  SELECT sri.variant_id, SUM(sri.quantity)::numeric,
         MAX(COALESCE(NULLIF(pv.pur_price, 0), p.default_pur_price, 0))::numeric
    FROM public.sale_return_items sri
    JOIN public.product_variants pv ON pv.id = sri.variant_id
    JOIN public.products p ON p.id = pv.product_id
   WHERE p_ref_type = 'sale_return' AND sri.return_id = p_doc_id AND sri.deleted_at IS NULL
     AND COALESCE(p.product_type, '') <> 'service'
   GROUP BY sri.variant_id
  HAVING SUM(sri.quantity) > 0;
$$;

-- 3. The sync now also takes sale returns (goods in: Main -> godown). -------------------------
CREATE OR REPLACE FUNCTION public._godown_sync_doc(
  p_organization_id uuid,
  p_ref_type text,
  p_doc_id uuid,
  p_godown_id uuid,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_out boolean;
  v_head record;
  v_active boolean := false;
  v_main uuid;
  v_target public.godowns%ROWTYPE;
  v_target_id uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_doc_date date;
  v_neg boolean;
  r record;
  v_pv record;
  v_label text;
  v_avail numeric;
  v_need numeric;
  v_qty numeric;
  v_from uuid;
  v_to uuid;
  v_key text;
  v_moves jsonb := '{}'::jsonb;
  v_move_id uuid;
  v_sent numeric := 0;
  v_undone numeric := 0;
  v_short jsonb := '[]'::jsonb;
  v_gname text;
BEGIN
  IF p_ref_type IS NULL OR p_ref_type NOT IN ('sale', 'sale_return') THEN
    RAISE EXCEPTION 'Godowns do not follow % yet', COALESCE(p_ref_type, 'this document');
  END IF;
  v_out := p_ref_type IN ('sale', 'challan', 'purchase_return');
  PERFORM pg_advisory_xact_lock(hashtext('godown_doc:' || p_ref_type || ':' || p_doc_id::text));

  SELECT g.id INTO v_main
    FROM public.godowns g
   WHERE g.organization_id = p_organization_id AND g.godown_type = 'main';
  IF v_main IS NULL THEN
    RETURN jsonb_build_object('godown_id', NULL, 'godown_name', NULL, 'is_main', true,
                              'moved', 0, 'moved_back', 0, 'short', '[]'::jsonb);
  END IF;

  SELECT h.doc_no, h.doc_date, h.active INTO v_head
    FROM public._godown_doc_head(p_ref_type, p_doc_id) h
   WHERE h.organization_id = p_organization_id;
  v_active := FOUND AND COALESCE(v_head.active, false);

  IF p_godown_id IS NOT NULL THEN
    SELECT * INTO v_target
      FROM public.godowns g
     WHERE g.id = p_godown_id AND g.organization_id = p_organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION '%', CASE WHEN v_out THEN 'Pick the godown the goods go out of'
                                ELSE 'Pick the godown the goods come into' END;
    END IF;
    v_target_id := v_target.id;
  ELSE
    SELECT dp.godown_id INTO v_target_id
      FROM public.godown_doc_places dp
      JOIN public.godowns g ON g.id = dp.godown_id AND g.organization_id = p_organization_id
     WHERE dp.ref_type = p_ref_type AND dp.doc_id = p_doc_id;
    v_target_id := COALESCE(v_target_id, v_main);
    SELECT * INTO v_target FROM public.godowns g WHERE g.id = v_target_id;
  END IF;

  v_neg := public.org_allows_negative_stock(p_organization_id);
  v_doc_date := LEAST(COALESCE(v_head.doc_date, v_today), v_today);

  FOR r IN
    WITH cur AS (
      SELECT x.godown_id, x.variant_id, SUM(x.qty) AS qty, MAX(x.rate) AS rate
        FROM (
          SELECT CASE WHEN v_out THEN m.from_godown_id ELSE m.to_godown_id END AS godown_id,
                 mi.variant_id, mi.qty, mi.rate
            FROM public.godown_moves m
            JOIN public.godown_move_items mi ON mi.move_id = m.id
           WHERE m.organization_id = p_organization_id AND m.ref_type = p_ref_type
             AND m.ref_id = p_doc_id AND m.status = 'done'
          UNION ALL
          SELECT CASE WHEN v_out THEN m.to_godown_id ELSE m.from_godown_id END,
                 mi.variant_id, -mi.qty, mi.rate
            FROM public.godown_moves m
            JOIN public.godown_move_items mi ON mi.move_id = m.id
           WHERE m.organization_id = p_organization_id AND m.ref_type = p_ref_type
             AND m.ref_id = p_doc_id AND m.status = 'done'
        ) x
       WHERE x.godown_id <> v_main
       GROUP BY x.godown_id, x.variant_id
    ),
    want AS (
      SELECT v_target_id AS godown_id, l.variant_id, l.qty, l.rate
        FROM public._godown_doc_lines(p_ref_type, p_doc_id) l
       WHERE v_active AND v_target_id <> v_main
    )
    SELECT COALESCE(w.godown_id, c.godown_id) AS godown_id,
           COALESCE(w.variant_id, c.variant_id) AS variant_id,
           COALESCE(w.qty, 0) - COALESCE(c.qty, 0) AS delta,
           COALESCE(w.rate, c.rate, 0) AS rate
      FROM want w
      FULL JOIN cur c ON c.godown_id = w.godown_id AND c.variant_id = w.variant_id
     WHERE COALESCE(w.qty, 0) - COALESCE(c.qty, 0) <> 0
     ORDER BY (COALESCE(w.qty, 0) - COALESCE(c.qty, 0)) > 0, 1, 2
  LOOP
    SELECT pv.id, pv.product_id, pv.stock_qty, pv.size, pv.color, p.product_name
      INTO v_pv
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
     WHERE pv.id = r.variant_id
       FOR UPDATE OF pv;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;
    v_label := COALESCE(v_pv.product_name, 'Item')
      || CASE WHEN NULLIF(btrim(COALESCE(v_pv.color, '')), '') IS NOT NULL THEN ' ' || btrim(v_pv.color) ELSE '' END
      || CASE WHEN NULLIF(btrim(COALESCE(v_pv.size, '')), '') IS NOT NULL
                AND upper(btrim(v_pv.size)) NOT IN ('FREE', 'NONE', 'NA', '-')
              THEN ' / ' || btrim(v_pv.size) ELSE '' END;
    v_need := abs(r.delta);

    IF (v_out AND r.delta > 0) OR (NOT v_out AND r.delta < 0) THEN
      SELECT gs.qty INTO v_avail
        FROM public.godown_stock gs
       WHERE gs.godown_id = r.godown_id AND gs.variant_id = r.variant_id
         FOR UPDATE;
      v_qty := LEAST(v_need, GREATEST(COALESCE(v_avail, 0), 0));
      v_from := r.godown_id;
      v_to := v_main;
    ELSE
      IF r.delta > 0 AND NOT v_target.is_active THEN
        RAISE EXCEPTION 'Godown % is closed. Pick another godown.', v_target.name;
      END IF;
      SELECT COALESCE(v_pv.stock_qty, 0) - COALESCE(SUM(gs.qty), 0)
        INTO v_avail
        FROM public.godown_stock gs
       WHERE gs.organization_id = p_organization_id AND gs.variant_id = r.variant_id;
      v_qty := CASE WHEN v_neg THEN v_need ELSE LEAST(v_need, GREATEST(v_avail, 0)) END;
      v_from := v_main;
      v_to := r.godown_id;
    END IF;

    IF v_qty < v_need THEN
      SELECT g.name INTO v_gname FROM public.godowns g WHERE g.id = r.godown_id;
      v_short := v_short || jsonb_build_array(jsonb_build_object(
        'item', v_label,
        'godown', v_gname,
        'qty', round(v_need - v_qty, 3),
        'way', CASE WHEN r.delta > 0 THEN 'forward' ELSE 'back' END));
    END IF;
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    v_key := v_from::text || '>' || v_to::text;
    v_move_id := (v_moves ->> v_key)::uuid;
    IF v_move_id IS NULL THEN
      INSERT INTO public.godown_moves (organization_id, move_date, from_godown_id, to_godown_id, ref_type, ref_id,
                                       ref_no, note, created_by)
      VALUES (p_organization_id, CASE WHEN r.delta > 0 THEN v_doc_date ELSE v_today END, v_from, v_to, p_ref_type,
              p_doc_id, NULLIF(btrim(COALESCE(v_head.doc_no, '')), ''),
              NULLIF(btrim(COALESCE(p_note, '')), ''), auth.uid())
      RETURNING id INTO v_move_id;
      v_moves := v_moves || jsonb_build_object(v_key, v_move_id);
    END IF;

    IF v_from <> v_main THEN
      UPDATE public.godown_stock
         SET qty = qty - v_qty, updated_at = now()
       WHERE godown_id = v_from AND variant_id = r.variant_id;
      DELETE FROM public.godown_stock WHERE godown_id = v_from AND variant_id = r.variant_id AND qty = 0;
    END IF;
    IF v_to <> v_main THEN
      INSERT INTO public.godown_stock AS gs (organization_id, godown_id, variant_id, qty)
      VALUES (p_organization_id, v_to, r.variant_id, v_qty)
      ON CONFLICT (godown_id, variant_id)
      DO UPDATE SET qty = gs.qty + EXCLUDED.qty, updated_at = now();
    END IF;
    IF r.delta > 0 THEN
      v_sent := v_sent + v_qty;
    ELSE
      v_undone := v_undone + v_qty;
    END IF;

    INSERT INTO public.godown_move_items (move_id, organization_id, variant_id, product_id, qty, rate, value)
    VALUES (v_move_id, p_organization_id, r.variant_id, v_pv.product_id, v_qty, round(COALESCE(r.rate, 0), 2),
            round(v_qty * COALESCE(r.rate, 0), 2));
  END LOOP;

  UPDATE public.godown_moves m
     SET total_qty = t.qty, total_value = t.value
    FROM (
      SELECT mi.move_id, SUM(mi.qty) AS qty, SUM(mi.value) AS value
        FROM public.godown_move_items mi
       WHERE mi.move_id IN (SELECT e.value::uuid FROM jsonb_each_text(v_moves) AS e)
       GROUP BY mi.move_id
    ) t
   WHERE m.id = t.move_id;

  RETURN jsonb_build_object(
    'godown_id', v_target_id,
    'godown_name', v_target.name,
    'is_main', v_target_id = v_main,
    'moved', v_sent,
    'moved_back', v_undone,
    'short', v_short);
END;
$$;

-- 4. Called by the screens after a save. Same as step 3d-2, with words for goods coming in. ---
CREATE OR REPLACE FUNCTION public.godown_sync_doc(p_ref_type text, p_doc_id uuid, p_godown_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_out jsonb;
  v_g public.godowns%ROWTYPE;
BEGIN
  SELECT h.organization_id INTO v_org FROM public._godown_doc_head(p_ref_type, p_doc_id) h;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Document not found';
  END IF;
  PERFORM public._assert_org_access(v_org);
  IF p_godown_id IS NULL THEN
    RAISE EXCEPTION '%', CASE WHEN p_ref_type = 'sale_return' THEN 'Pick the godown the goods come into'
                              ELSE 'Pick the godown the goods go out of' END;
  END IF;

  IF p_ref_type = 'challan' THEN
    SELECT * INTO v_g
      FROM public.godowns g
     WHERE g.id = p_godown_id AND g.organization_id = v_org;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pick the godown the goods go out of';
    END IF;
    IF NOT v_g.is_active AND NOT EXISTS (
      SELECT 1 FROM public.godown_doc_places dp
       WHERE dp.ref_type = p_ref_type AND dp.doc_id = p_doc_id AND dp.godown_id = v_g.id
    ) THEN
      RAISE EXCEPTION 'Godown % is closed. Pick another godown.', v_g.name;
    END IF;
    v_out := jsonb_build_object('godown_id', v_g.id, 'godown_name', v_g.name, 'is_main', v_g.godown_type = 'main',
                                'moved', 0, 'moved_back', 0, 'short', '[]'::jsonb);
  ELSE
    v_out := public._godown_sync_doc(v_org, p_ref_type, p_doc_id, p_godown_id,
                                     initcap(replace(p_ref_type, '_', ' ')));
  END IF;

  IF COALESCE((v_out ->> 'is_main')::boolean, true) THEN
    DELETE FROM public.godown_doc_places WHERE ref_type = p_ref_type AND doc_id = p_doc_id;
  ELSE
    INSERT INTO public.godown_doc_places AS dp (ref_type, doc_id, organization_id, godown_id, updated_at, updated_by)
    VALUES (p_ref_type, p_doc_id, v_org, p_godown_id, now(), auth.uid())
    ON CONFLICT (ref_type, doc_id)
    DO UPDATE SET godown_id = EXCLUDED.godown_id, updated_at = now(), updated_by = auth.uid();
  END IF;
  RETURN v_out;
END;
$$;

-- 5. Delete / cancel / restore / remove: works for tables with or without is_cancelled. --------
CREATE OR REPLACE FUNCTION public.trg_godown_doc_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text := TG_ARGV[0];
  v_row jsonb;
  v_id uuid;
  v_org uuid;
  v_cancelled boolean;
  v_what text;
BEGIN
  BEGIN
    IF TG_OP = 'DELETE' THEN
      v_row := to_jsonb(OLD);
    ELSE
      v_row := to_jsonb(NEW);
    END IF;
    v_id := (v_row ->> 'id')::uuid;
    v_org := (v_row ->> 'organization_id')::uuid;
    v_cancelled := COALESCE((v_row ->> 'is_cancelled')::boolean, false);
    v_what := CASE
      WHEN TG_OP = 'DELETE' THEN 'removed'
      WHEN v_row ->> 'deleted_at' IS NULL AND NOT v_cancelled THEN 'restored'
      WHEN v_cancelled THEN 'cancelled'
      ELSE 'deleted'
    END;
    IF EXISTS (SELECT 1 FROM public.godown_moves m WHERE m.ref_id = v_id AND m.ref_type = v_type) THEN
      PERFORM public._godown_sync_doc(v_org, v_type, v_id, NULL,
                                      initcap(replace(v_type, '_', ' ')) || ' ' || v_what);
      IF TG_OP = 'DELETE' THEN
        DELETE FROM public.godown_doc_places WHERE ref_type = v_type AND doc_id = v_id;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Godown stock for % % was not updated: %', v_type, v_id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_godown_sale_return_state ON public.sale_returns;
CREATE CONSTRAINT TRIGGER trg_godown_sale_return_state
  AFTER UPDATE OF deleted_at ON public.sale_returns
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION public.trg_godown_doc_sync('sale_return');

DROP TRIGGER IF EXISTS trg_godown_sale_return_removed ON public.sale_returns;
CREATE CONSTRAINT TRIGGER trg_godown_sale_return_removed
  AFTER DELETE ON public.sale_returns
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_godown_doc_sync('sale_return');

REVOKE ALL ON FUNCTION public._godown_doc_head(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._godown_doc_lines(text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._godown_sync_doc(uuid, text, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_godown_doc_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.godown_sync_doc(text, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.godown_sync_doc(text, uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
