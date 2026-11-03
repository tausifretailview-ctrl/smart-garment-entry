-- Industrial mode, Phase 3 step 3c: receive a purchase bill into a godown.
--
-- One new table, new functions and two new triggers only. No existing table, function or trigger
-- changes.
--
-- How it works:
--   * The purchase bill saves exactly as today, so its stock first lands on Main (shop stock).
--   * Right after the save, Purchase Entry calls godown_sync_purchase_bill(bill, godown). It moves
--     the bill's quantities from Main into the picked godown (godown_moves.ref_type 'purchase').
--     On an edit it moves only the difference, and brings goods back to Main when lines are cut,
--     an item is changed or the bill's godown is changed back to Main.
--   * Deleting, cancelling, restoring or removing a bill runs the same sync when the change commits
--     (deferred triggers), so a deleted bill takes its goods back out of the godown and a restored
--     bill puts them back. The triggers stop at once for bills that never went into a godown, which
--     is every bill of shops not using godowns, and they never block the bill change itself.
--   * Goods that already left the godown (moved on by a transfer) are not taken back; the sync
--     reports them as short, does not take the same quantity from Main again, and tries again on
--     the next save.

DO $$
BEGIN
  IF to_regclass('public.godown_moves') IS NULL OR to_regclass('public.godown_stock') IS NULL THEN
    RAISE EXCEPTION 'Run the Phase 3 step 3a godowns SQL first';
  END IF;
END;
$$;

-- 1. Which godown each purchase bill goes into (only bills sent to a godown other than Main).
CREATE TABLE IF NOT EXISTS public.godown_purchase_bills (
  bill_id uuid PRIMARY KEY REFERENCES public.purchase_bills(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  godown_id uuid NOT NULL REFERENCES public.godowns(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE INDEX IF NOT EXISTS idx_godown_purchase_bills_org_godown
  ON public.godown_purchase_bills (organization_id, godown_id);

COMMENT ON TABLE public.godown_purchase_bills IS
  'Industrial mode: the godown a purchase bill was received into. Written only by godown_sync_purchase_bill.';

ALTER TABLE public.godown_purchase_bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS godown_purchase_bills_select ON public.godown_purchase_bills;
CREATE POLICY godown_purchase_bills_select ON public.godown_purchase_bills FOR SELECT TO authenticated USING (
  EXISTS (SELECT 1 FROM public.organization_members om
           WHERE om.organization_id = godown_purchase_bills.organization_id AND om.user_id = auth.uid()));

-- 2. The sync (internal, no access check; called by the function and triggers below). --------
--    p_godown_id NULL keeps the godown saved for the bill (used by the triggers).
CREATE OR REPLACE FUNCTION public._godown_sync_purchase(
  p_organization_id uuid,
  p_bill_id uuid,
  p_godown_id uuid,
  p_note text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_bill record;
  v_active boolean := false;
  v_main uuid;
  v_target public.godowns%ROWTYPE;
  v_target_id uuid;
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_in_date date;
  v_neg boolean;
  r record;
  v_pv record;
  v_label text;
  v_avail numeric;
  v_qty numeric;
  v_from uuid;
  v_to uuid;
  v_key text;
  v_moves jsonb := '{}'::jsonb;
  v_move_id uuid;
  v_rate numeric;
  v_in numeric := 0;
  v_back numeric := 0;
  v_short jsonb := '[]'::jsonb;
  v_left jsonb := '{}'::jsonb;
  v_need numeric;
  v_gname text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('godown_purchase:' || p_bill_id::text));

  SELECT g.id INTO v_main
    FROM public.godowns g
   WHERE g.organization_id = p_organization_id AND g.godown_type = 'main';
  IF v_main IS NULL THEN
    RETURN jsonb_build_object('godown_id', NULL, 'godown_name', NULL, 'is_main', true,
                              'moved_in', 0, 'moved_back', 0, 'short', '[]'::jsonb);
  END IF;

  SELECT pb.id, pb.software_bill_no, pb.bill_date, pb.deleted_at, pb.is_cancelled
    INTO v_bill
    FROM public.purchase_bills pb
   WHERE pb.id = p_bill_id AND pb.organization_id = p_organization_id;
  v_active := FOUND AND v_bill.deleted_at IS NULL AND NOT COALESCE(v_bill.is_cancelled, false);

  IF p_godown_id IS NOT NULL THEN
    SELECT * INTO v_target
      FROM public.godowns g
     WHERE g.id = p_godown_id AND g.organization_id = p_organization_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Pick the godown the goods go into';
    END IF;
    v_target_id := v_target.id;
  ELSE
    SELECT pg.godown_id INTO v_target_id
      FROM public.godown_purchase_bills pg
      JOIN public.godowns g ON g.id = pg.godown_id AND g.organization_id = p_organization_id
     WHERE pg.bill_id = p_bill_id;
    v_target_id := COALESCE(v_target_id, v_main);
    SELECT * INTO v_target FROM public.godowns g WHERE g.id = v_target_id;
  END IF;

  v_neg := public.org_allows_negative_stock(p_organization_id);
  v_in_date := LEAST(COALESCE(v_bill.bill_date::date, v_today), v_today);

  FOR r IN
    WITH cur AS (
      SELECT x.godown_id, x.variant_id, SUM(x.qty) AS qty, MAX(x.rate) AS rate
        FROM (
          SELECT m.to_godown_id AS godown_id, mi.variant_id, mi.qty, mi.rate
            FROM public.godown_moves m
            JOIN public.godown_move_items mi ON mi.move_id = m.id
           WHERE m.organization_id = p_organization_id AND m.ref_type = 'purchase'
             AND m.ref_id = p_bill_id AND m.status = 'done'
          UNION ALL
          SELECT m.from_godown_id, mi.variant_id, -mi.qty, mi.rate
            FROM public.godown_moves m
            JOIN public.godown_move_items mi ON mi.move_id = m.id
           WHERE m.organization_id = p_organization_id AND m.ref_type = 'purchase'
             AND m.ref_id = p_bill_id AND m.status = 'done'
        ) x
       WHERE x.godown_id <> v_main
       GROUP BY x.godown_id, x.variant_id
    ),
    want AS (
      SELECT v_target_id AS godown_id, pi.sku_id AS variant_id, SUM(pi.qty)::numeric AS qty,
             SUM(pi.qty * COALESCE(pi.pur_price, 0))::numeric / NULLIF(SUM(pi.qty), 0)::numeric AS rate
        FROM public.purchase_items pi
        JOIN public.product_variants pv ON pv.id = pi.sku_id
        JOIN public.products p ON p.id = pv.product_id
       WHERE v_active AND v_target_id <> v_main
         AND pi.bill_id = p_bill_id AND pi.deleted_at IS NULL AND pi.sku_id IS NOT NULL
         AND COALESCE(p.product_type, '') NOT IN ('service', 'combo')
       GROUP BY pi.sku_id
      HAVING SUM(pi.qty) > 0
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

    IF r.delta > 0 THEN
      v_need := r.delta - COALESCE((v_left ->> r.variant_id::text)::numeric, 0);
      IF v_need <= 0 THEN
        CONTINUE;
      END IF;
      IF NOT v_target.is_active THEN
        RAISE EXCEPTION 'Godown % is closed. Pick another godown.', v_target.name;
      END IF;
      SELECT COALESCE(v_pv.stock_qty, 0) - COALESCE(SUM(gs.qty), 0)
        INTO v_avail
        FROM public.godown_stock gs
       WHERE gs.organization_id = p_organization_id AND gs.variant_id = r.variant_id;
      v_qty := CASE WHEN v_neg THEN v_need ELSE LEAST(v_need, GREATEST(v_avail, 0)) END;
      v_from := v_main;
      v_to := r.godown_id;
    ELSE
      v_need := -r.delta;
      SELECT gs.qty INTO v_avail
        FROM public.godown_stock gs
       WHERE gs.godown_id = r.godown_id AND gs.variant_id = r.variant_id
         FOR UPDATE;
      v_qty := LEAST(v_need, GREATEST(COALESCE(v_avail, 0), 0));
      v_from := r.godown_id;
      v_to := v_main;
      IF v_qty < v_need THEN
        v_left := v_left || jsonb_build_object(r.variant_id::text,
          COALESCE((v_left ->> r.variant_id::text)::numeric, 0) + v_need - v_qty);
      END IF;
    END IF;

    IF v_qty < v_need THEN
      SELECT g.name INTO v_gname FROM public.godowns g WHERE g.id = r.godown_id;
      v_short := v_short || jsonb_build_array(jsonb_build_object(
        'item', v_label,
        'godown', v_gname,
        'qty', round(v_need - v_qty, 3),
        'way', CASE WHEN r.delta > 0 THEN 'in' ELSE 'back' END));
    END IF;
    IF v_qty <= 0 THEN
      CONTINUE;
    END IF;

    v_key := v_from::text || '>' || v_to::text;
    v_move_id := (v_moves ->> v_key)::uuid;
    IF v_move_id IS NULL THEN
      INSERT INTO public.godown_moves (organization_id, move_date, from_godown_id, to_godown_id, ref_type, ref_id,
                                       ref_no, note, created_by)
      VALUES (p_organization_id, CASE WHEN r.delta > 0 THEN v_in_date ELSE v_today END, v_from, v_to, 'purchase',
              p_bill_id, NULLIF(btrim(COALESCE(v_bill.software_bill_no, '')), ''),
              NULLIF(btrim(COALESCE(p_note, '')), ''), auth.uid())
      RETURNING id INTO v_move_id;
      v_moves := v_moves || jsonb_build_object(v_key, v_move_id);
    END IF;

    IF r.delta > 0 THEN
      INSERT INTO public.godown_stock AS gs (organization_id, godown_id, variant_id, qty)
      VALUES (p_organization_id, v_to, r.variant_id, v_qty)
      ON CONFLICT (godown_id, variant_id)
      DO UPDATE SET qty = gs.qty + EXCLUDED.qty, updated_at = now();
      v_in := v_in + v_qty;
    ELSE
      UPDATE public.godown_stock
         SET qty = qty - v_qty, updated_at = now()
       WHERE godown_id = v_from AND variant_id = r.variant_id;
      DELETE FROM public.godown_stock WHERE godown_id = v_from AND variant_id = r.variant_id AND qty = 0;
      v_back := v_back + v_qty;
    END IF;

    v_rate := COALESCE(r.rate, 0);
    INSERT INTO public.godown_move_items (move_id, organization_id, variant_id, product_id, qty, rate, value)
    VALUES (v_move_id, p_organization_id, r.variant_id, v_pv.product_id, v_qty, round(v_rate, 2), round(v_qty * v_rate, 2));
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
    'moved_in', v_in,
    'moved_back', v_back,
    'short', v_short);
END;
$$;

-- 3. Called by Purchase Entry after a bill is saved: put the bill's goods in this godown. ----
--    Pass the Main godown to bring them back to the shop stock.
CREATE OR REPLACE FUNCTION public.godown_sync_purchase_bill(p_bill_id uuid, p_godown_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
  v_out jsonb;
BEGIN
  SELECT pb.organization_id INTO v_org FROM public.purchase_bills pb WHERE pb.id = p_bill_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Purchase bill not found';
  END IF;
  PERFORM public._assert_org_access(v_org);
  IF p_godown_id IS NULL THEN
    RAISE EXCEPTION 'Pick the godown the goods go into';
  END IF;
  v_out := public._godown_sync_purchase(v_org, p_bill_id, p_godown_id, 'Purchase bill');
  IF COALESCE((v_out ->> 'is_main')::boolean, true) THEN
    DELETE FROM public.godown_purchase_bills WHERE bill_id = p_bill_id;
  ELSE
    INSERT INTO public.godown_purchase_bills AS pg (bill_id, organization_id, godown_id, updated_at, updated_by)
    VALUES (p_bill_id, v_org, p_godown_id, now(), auth.uid())
    ON CONFLICT (bill_id)
    DO UPDATE SET godown_id = EXCLUDED.godown_id, updated_at = now(), updated_by = auth.uid();
  END IF;
  RETURN v_out;
END;
$$;

-- 4. Delete / cancel / restore / remove of a bill: follow it at commit, never block it. -------
CREATE OR REPLACE FUNCTION public.trg_godown_purchase_bill_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_org uuid;
  v_note text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_id := OLD.id;
    v_org := OLD.organization_id;
    v_note := 'Purchase bill removed';
  ELSE
    v_id := NEW.id;
    v_org := NEW.organization_id;
    v_note := CASE
      WHEN NEW.deleted_at IS NULL AND NOT COALESCE(NEW.is_cancelled, false) THEN 'Purchase bill restored'
      WHEN COALESCE(NEW.is_cancelled, false) THEN 'Purchase bill cancelled'
      ELSE 'Purchase bill deleted'
    END;
  END IF;
  BEGIN
    IF EXISTS (SELECT 1 FROM public.godown_moves m WHERE m.ref_id = v_id AND m.ref_type = 'purchase') THEN
      PERFORM public._godown_sync_purchase(v_org, v_id, NULL, v_note);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'Godown stock for purchase bill % was not updated: %', v_id, SQLERRM;
  END;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_godown_purchase_bill_state ON public.purchase_bills;
CREATE CONSTRAINT TRIGGER trg_godown_purchase_bill_state
  AFTER UPDATE OF deleted_at, is_cancelled ON public.purchase_bills
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at OR OLD.is_cancelled IS DISTINCT FROM NEW.is_cancelled)
  EXECUTE FUNCTION public.trg_godown_purchase_bill_sync();

DROP TRIGGER IF EXISTS trg_godown_purchase_bill_removed ON public.purchase_bills;
CREATE CONSTRAINT TRIGGER trg_godown_purchase_bill_removed
  AFTER DELETE ON public.purchase_bills
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_godown_purchase_bill_sync();

-- 5. Grants: the sync is internal; logged-in users call godown_sync_purchase_bill. -----------
REVOKE ALL ON FUNCTION public._godown_sync_purchase(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_godown_purchase_bill_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.godown_sync_purchase_bill(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.godown_sync_purchase_bill(uuid, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
