-- Manufacturer ERP, phase 2: production lots, fabric issue from rolls, cutting, job cards per
-- worker (send / receive at each stage) and finished pieces into stock.
--
-- Stock rules (so Stock Reconciliation and drift checks stay at zero):
--   * Loose MTR fabric (stock_qty is metres): issuing metres lowers stock_qty AND opening_qty by
--     the same amount, like Stock Adjustment does; a return or leftover put back raises both.
--   * Roll-wise MTR fabric (one variant per roll, size = roll metres, stock_qty = rolls): metres
--     are tracked in mfg_fabric_ledger only. When cutting is saved and a roll has no metres left,
--     its stock_qty (and opening_qty) drop to 0 so POS cannot sell a used-up roll.
--   * Finished pieces: stock_qty AND opening_qty rise by the pieces, pur_price becomes the lot's
--     cost per piece. Every change writes a 'reconciliation' stock_movements row naming the lot.
-- All functions are SECURITY INVOKER: the caller's RLS (shop member; variants need admin/manager)
-- applies, and the Manufacturing page is admin/manager only.

-- 0. Cutting stage flag (Cutting is recorded on the lot, other stages through job cards).
ALTER TABLE public.mfg_stages ADD COLUMN IF NOT EXISTS is_cutting boolean NOT NULL DEFAULT false;
UPDATE public.mfg_stages SET is_cutting = true WHERE lower(btrim(name)) = 'cutting' AND NOT is_cutting;

-- 1. Lots ---------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.mfg_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lot_no text NOT NULL,
  lot_date date NOT NULL DEFAULT CURRENT_DATE,
  design_id uuid REFERENCES public.mfg_designs(id) ON DELETE SET NULL,
  finished_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  sale_order_id uuid REFERENCES public.sale_orders(id) ON DELETE SET NULL,
  -- Process stages this lot goes through, in order (cutting excluded).
  stage_ids uuid[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'cut', 'finished', 'cancelled')),
  end_bits_action text NOT NULL DEFAULT 'wastage' CHECK (end_bits_action IN ('wastage', 'stock')),
  cutting_worker_type text CHECK (cutting_worker_type IN ('employee', 'supplier')),
  cutting_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  cutting_supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  cutting_worker_name text,
  cutting_rate numeric(12,2) NOT NULL DEFAULT 0 CHECK (cutting_rate >= 0),
  cut_at timestamptz,
  finished_at timestamptz,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS mfg_lots_no_uq ON public.mfg_lots (organization_id, lower(lot_no));
CREATE INDEX IF NOT EXISTS mfg_lots_org_status_idx ON public.mfg_lots (organization_id, status, lot_date DESC);

-- Size × colour lines of a lot: one finished-product variant each.
CREATE TABLE IF NOT EXISTS public.mfg_lot_sizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.mfg_lots(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  planned_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (planned_qty >= 0),
  cut_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (cut_qty >= 0),
  finished_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (finished_qty >= 0),
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (lot_id, variant_id)
);

-- Fabric rolls issued to a lot for cutting.
CREATE TABLE IF NOT EXISTS public.mfg_lot_rolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.mfg_lots(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  issued_meters numeric(12,3) NOT NULL CHECK (issued_meters > 0),
  leftover_meters numeric(12,3) NOT NULL DEFAULT 0 CHECK (leftover_meters >= 0),
  leftover_action text CHECK (leftover_action IN ('wastage', 'stock')),
  pur_price numeric(12,2) NOT NULL DEFAULT 0,
  cancelled_at timestamptz,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfg_lot_rolls_lot_idx ON public.mfg_lot_rolls (lot_id);

-- Job cards: pieces sent to one worker at one stage; receipts bring them back.
CREATE TABLE IF NOT EXISTS public.mfg_job_cards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.mfg_lots(id) ON DELETE CASCADE,
  stage_id uuid NOT NULL REFERENCES public.mfg_stages(id) ON DELETE RESTRICT,
  worker_type text NOT NULL CHECK (worker_type IN ('employee', 'supplier')),
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  worker_name text NOT NULL CHECK (char_length(btrim(worker_name)) BETWEEN 1 AND 120),
  sent_qty numeric(12,3) NOT NULL CHECK (sent_qty > 0),
  rate numeric(12,2) NOT NULL DEFAULT 0 CHECK (rate >= 0),
  sent_date date NOT NULL DEFAULT CURRENT_DATE,
  due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  -- Pieces never returned when the card was closed short (counted as missing).
  closed_short_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (closed_short_qty >= 0),
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfg_job_cards_lot_idx ON public.mfg_job_cards (lot_id, stage_id);
CREATE INDEX IF NOT EXISTS mfg_job_cards_open_idx ON public.mfg_job_cards (organization_id, status, sent_date);

CREATE TABLE IF NOT EXISTS public.mfg_job_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_card_id uuid NOT NULL REFERENCES public.mfg_job_cards(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.mfg_lots(id) ON DELETE CASCADE,
  good_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (good_qty >= 0),
  rejected_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0),
  wasted_qty numeric(12,3) NOT NULL DEFAULT 0 CHECK (wasted_qty >= 0),
  reason text,
  received_date date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (good_qty + rejected_qty + wasted_qty > 0)
);

CREATE INDEX IF NOT EXISTS mfg_job_receipts_card_idx ON public.mfg_job_receipts (job_card_id);
CREATE INDEX IF NOT EXISTS mfg_job_receipts_lot_idx ON public.mfg_job_receipts (lot_id);

-- Finished pieces put into stock.
CREATE TABLE IF NOT EXISTS public.mfg_lot_finishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  lot_id uuid NOT NULL REFERENCES public.mfg_lots(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  qty numeric(12,3) NOT NULL CHECK (qty > 0),
  cost_per_piece numeric(12,2) NOT NULL DEFAULT 0 CHECK (cost_per_piece >= 0),
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mfg_lot_finishes_lot_idx ON public.mfg_lot_finishes (lot_id);

DROP TRIGGER IF EXISTS mfg_lots_touch ON public.mfg_lots;
CREATE TRIGGER mfg_lots_touch BEFORE INSERT OR UPDATE ON public.mfg_lots
  FOR EACH ROW EXECUTE FUNCTION public.mfg_touch_row();
DROP TRIGGER IF EXISTS mfg_job_cards_touch ON public.mfg_job_cards;
CREATE TRIGGER mfg_job_cards_touch BEFORE INSERT OR UPDATE ON public.mfg_job_cards
  FOR EACH ROW EXECUTE FUNCTION public.mfg_touch_row();

-- 2. Row level security: members read/insert/update their shop's rows. Deletes: admins only,
--    and only for job cards / receipts (typing mistakes). Lots, rolls and finishes are never
--    deleted because fabric and stock have moved; a lot is cancelled instead.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['mfg_lots', 'mfg_lot_sizes', 'mfg_lot_rolls', 'mfg_job_cards', 'mfg_job_receipts', 'mfg_lot_finishes']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
         EXISTS (SELECT 1 FROM public.organization_members om
                 WHERE om.organization_id = %I.organization_id AND om.user_id = auth.uid()))',
      t || '_select', t, t);

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
         EXISTS (SELECT 1 FROM public.organization_members om
                 WHERE om.organization_id = %I.organization_id AND om.user_id = auth.uid()))',
      t || '_insert', t, t);

    IF t <> 'mfg_lot_finishes' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated
           USING (EXISTS (SELECT 1 FROM public.organization_members om
                          WHERE om.organization_id = %I.organization_id AND om.user_id = auth.uid()))
           WITH CHECK (EXISTS (SELECT 1 FROM public.organization_members om
                          WHERE om.organization_id = %I.organization_id AND om.user_id = auth.uid()))',
        t || '_update', t, t, t);
    END IF;
  END LOOP;
END;
$$;

DROP POLICY IF EXISTS mfg_job_cards_delete ON public.mfg_job_cards;
CREATE POLICY mfg_job_cards_delete ON public.mfg_job_cards
  FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role));

DROP POLICY IF EXISTS mfg_job_receipts_delete ON public.mfg_job_receipts;
CREATE POLICY mfg_job_receipts_delete ON public.mfg_job_receipts
  FOR DELETE TO authenticated
  USING (public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role));

-- 3. Helpers --------------------------------------------------------------------------------
-- Net metres taken off a variant for production (issue + wastage − return).
CREATE OR REPLACE FUNCTION public._mfg_variant_meters_used(p_variant_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT COALESCE(-SUM(signed_meters), 0) FROM public.mfg_fabric_ledger WHERE variant_id = p_variant_id;
$$;

-- Move a variant's stock and opening together (keeps reconciliation drift at zero) and log it.
CREATE OR REPLACE FUNCTION public._mfg_move_variant_stock(
  p_variant_id uuid, p_organization_id uuid, p_qty numeric, p_lot_id uuid, p_lot_no text, p_note text
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(p_qty, 0) = 0 THEN
    RETURN;
  END IF;
  UPDATE public.product_variants
     SET stock_qty = COALESCE(stock_qty, 0) + p_qty,
         opening_qty = COALESCE(opening_qty, 0) + p_qty,
         updated_at = now()
   WHERE id = p_variant_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Stock item not found or not allowed';
  END IF;
  INSERT INTO public.stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, bill_number, notes, user_id)
  VALUES (p_variant_id, p_organization_id, 'reconciliation', p_qty, p_lot_id, p_lot_no, p_note, auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION public._mfg_is_roll_size(p_size text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(btrim(p_size) ~ '^[0-9]+(\.[0-9]+)?$', false);
$$;

-- Good pieces out of the stage at position p_pos of the lot's stage_ids (0 = pieces cut).
CREATE OR REPLACE FUNCTION public._mfg_stage_output(p_lot_id uuid, p_pos integer)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT CASE
    WHEN COALESCE(p_pos, 0) <= 0 THEN
      (SELECT COALESCE(SUM(ls.cut_qty), 0) FROM public.mfg_lot_sizes ls WHERE ls.lot_id = p_lot_id)
    ELSE
      (SELECT COALESCE(SUM(r.good_qty), 0)
         FROM public.mfg_job_receipts r
         JOIN public.mfg_job_cards c ON c.id = r.job_card_id
         JOIN public.mfg_lots l ON l.id = c.lot_id
        WHERE c.lot_id = p_lot_id AND c.stage_id = l.stage_ids[p_pos])
  END;
$$;

-- 4. Create a lot with its size × colour lines ------------------------------------------------
-- p_sizes = [{"variant_id": "...", "planned_qty": 20}, ...]
CREATE OR REPLACE FUNCTION public.mfg_create_lot(
  p_organization_id uuid,
  p_finished_product_id uuid,
  p_design_id uuid,
  p_lot_date date,
  p_stage_ids uuid[],
  p_end_bits_action text,
  p_sale_order_id uuid,
  p_notes text,
  p_sizes jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lot_id uuid;
  v_next integer;
  v_lines integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products
     WHERE id = p_finished_product_id AND organization_id = p_organization_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Pick the finished product for this lot';
  END IF;

  SELECT COALESCE(MAX((regexp_match(lot_no, '^LOT-([0-9]+)$'))[1]::integer), 0) + 1
    INTO v_next
    FROM public.mfg_lots
   WHERE organization_id = p_organization_id;

  INSERT INTO public.mfg_lots (organization_id, lot_no, lot_date, design_id, finished_product_id, sale_order_id,
                               stage_ids, end_bits_action, notes)
  VALUES (
    p_organization_id,
    'LOT-' || lpad(v_next::text, 4, '0'),
    COALESCE(p_lot_date, CURRENT_DATE),
    p_design_id,
    p_finished_product_id,
    p_sale_order_id,
    COALESCE(
      (SELECT array_agg(s.id ORDER BY x.ord)
         FROM unnest(COALESCE(p_stage_ids, '{}')) WITH ORDINALITY AS x(id, ord)
         JOIN public.mfg_stages s ON s.id = x.id AND s.organization_id = p_organization_id AND NOT s.is_cutting),
      '{}'
    ),
    CASE WHEN p_end_bits_action = 'stock' THEN 'stock' ELSE 'wastage' END,
    NULLIF(btrim(COALESCE(p_notes, '')), '')
  )
  RETURNING id INTO v_lot_id;

  INSERT INTO public.mfg_lot_sizes (organization_id, lot_id, variant_id, planned_qty, sort_order)
  SELECT p_organization_id, v_lot_id, pv.id, GREATEST(COALESCE((x.item->>'planned_qty')::numeric, 0), 0), x.ord::integer
    FROM jsonb_array_elements(COALESCE(p_sizes, '[]'::jsonb)) WITH ORDINALITY AS x(item, ord)
    JOIN public.product_variants pv
      ON pv.id = (x.item->>'variant_id')::uuid
     AND pv.product_id = p_finished_product_id
     AND pv.organization_id = p_organization_id
     AND pv.deleted_at IS NULL
   WHERE COALESCE((x.item->>'planned_qty')::numeric, 0) > 0
  ON CONFLICT (lot_id, variant_id) DO NOTHING;

  GET DIAGNOSTICS v_lines = ROW_COUNT;
  IF v_lines = 0 THEN
    RAISE EXCEPTION 'Enter pieces to make for at least one size';
  END IF;

  RETURN v_lot_id;
END;
$$;

-- 5. Issue fabric from a roll to a lot ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mfg_issue_fabric(p_lot_id uuid, p_variant_id uuid, p_meters numeric)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lot public.mfg_lots%ROWTYPE;
  v_pv record;
  v_left numeric;
  v_is_roll boolean;
  v_roll_id uuid;
BEGIN
  IF COALESCE(p_meters, 0) <= 0 THEN
    RAISE EXCEPTION 'Enter metres to issue';
  END IF;

  SELECT * INTO v_lot FROM public.mfg_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot not found';
  END IF;
  IF v_lot.status <> 'open' THEN
    RAISE EXCEPTION 'Cutting is already saved for this lot; fabric can no longer be issued';
  END IF;

  SELECT pv.id, pv.size, COALESCE(pv.stock_qty, 0) AS stock_qty,
         COALESCE(NULLIF(pv.pur_price, 0), p.default_pur_price, 0) AS pur_price
    INTO v_pv
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
   WHERE pv.id = p_variant_id
     AND pv.organization_id = v_lot.organization_id
     AND pv.deleted_at IS NULL
     AND upper(COALESCE(p.uom, '')) = 'MTR'
   FOR UPDATE OF pv;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'This is not an MTR fabric of this shop';
  END IF;

  v_is_roll := public._mfg_is_roll_size(v_pv.size);
  IF v_is_roll THEN
    v_left := CASE WHEN v_pv.stock_qty > 0
                   THEN btrim(v_pv.size)::numeric * v_pv.stock_qty - public._mfg_variant_meters_used(p_variant_id)
                   ELSE 0 END;
  ELSE
    v_left := v_pv.stock_qty;
  END IF;

  IF p_meters > v_left + 0.0005 THEN
    RAISE EXCEPTION 'Only % m left on this fabric', round(GREATEST(v_left, 0), 2);
  END IF;

  INSERT INTO public.mfg_lot_rolls (organization_id, lot_id, variant_id, issued_meters, pur_price)
  VALUES (v_lot.organization_id, p_lot_id, p_variant_id, p_meters, v_pv.pur_price)
  RETURNING id INTO v_roll_id;

  INSERT INTO public.mfg_fabric_ledger (organization_id, variant_id, entry_type, meters, lot_id, reason)
  VALUES (v_lot.organization_id, p_variant_id, 'issue', p_meters, p_lot_id, 'Issued to ' || v_lot.lot_no);

  IF NOT v_is_roll THEN
    PERFORM public._mfg_move_variant_stock(p_variant_id, v_lot.organization_id, -p_meters, p_lot_id, v_lot.lot_no,
                                           'Manufacturing: fabric issued to ' || v_lot.lot_no);
  END IF;

  RETURN v_roll_id;
END;
$$;

-- Undo an issue before cutting is saved (wrong roll or metres typed).
CREATE OR REPLACE FUNCTION public.mfg_cancel_fabric_issue(p_lot_roll_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_roll public.mfg_lot_rolls%ROWTYPE;
  v_lot public.mfg_lots%ROWTYPE;
  v_size text;
BEGIN
  SELECT * INTO v_roll FROM public.mfg_lot_rolls WHERE id = p_lot_roll_id FOR UPDATE;
  IF NOT FOUND OR v_roll.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Fabric issue not found';
  END IF;
  SELECT * INTO v_lot FROM public.mfg_lots WHERE id = v_roll.lot_id FOR UPDATE;
  IF v_lot.status <> 'open' THEN
    RAISE EXCEPTION 'Cutting is already saved for this lot';
  END IF;

  UPDATE public.mfg_lot_rolls SET cancelled_at = now() WHERE id = p_lot_roll_id;

  INSERT INTO public.mfg_fabric_ledger (organization_id, variant_id, entry_type, meters, lot_id, reason)
  VALUES (v_roll.organization_id, v_roll.variant_id, 'return', v_roll.issued_meters, v_roll.lot_id,
          'Issue cancelled on ' || v_lot.lot_no);

  SELECT size INTO v_size FROM public.product_variants WHERE id = v_roll.variant_id;
  IF NOT public._mfg_is_roll_size(v_size) THEN
    PERFORM public._mfg_move_variant_stock(v_roll.variant_id, v_roll.organization_id, v_roll.issued_meters,
                                           v_roll.lot_id, v_lot.lot_no, 'Manufacturing: issue cancelled on ' || v_lot.lot_no);
  END IF;
END;
$$;

-- 6. Save cutting ---------------------------------------------------------------------------
-- p_cut = [{"lot_size_id": "...", "cut_qty": 18}], p_leftovers = [{"lot_roll_id": "...", "leftover_meters": 1.5}]
CREATE OR REPLACE FUNCTION public.mfg_save_cutting(
  p_lot_id uuid,
  p_cut jsonb,
  p_leftovers jsonb,
  p_end_bits_action text,
  p_worker_type text,
  p_employee_id uuid,
  p_supplier_id uuid,
  p_worker_name text,
  p_rate numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lot public.mfg_lots%ROWTYPE;
  v_action text := CASE WHEN p_end_bits_action = 'stock' THEN 'stock' ELSE 'wastage' END;
  v_total numeric;
  r record;
  v_left numeric;
BEGIN
  SELECT * INTO v_lot FROM public.mfg_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot not found';
  END IF;
  IF v_lot.status <> 'open' THEN
    RAISE EXCEPTION 'Cutting is already saved for this lot';
  END IF;

  UPDATE public.mfg_lot_sizes ls
     SET cut_qty = GREATEST(COALESCE((x.item->>'cut_qty')::numeric, 0), 0)
    FROM jsonb_array_elements(COALESCE(p_cut, '[]'::jsonb)) AS x(item)
   WHERE ls.id = (x.item->>'lot_size_id')::uuid
     AND ls.lot_id = p_lot_id;

  SELECT COALESCE(SUM(cut_qty), 0) INTO v_total FROM public.mfg_lot_sizes WHERE lot_id = p_lot_id;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Enter pieces cut for at least one size';
  END IF;

  -- Leftover end bits on each issued roll.
  FOR r IN
    SELECT lr.*, GREATEST(COALESCE((x.item->>'leftover_meters')::numeric, 0), 0) AS leftover
      FROM public.mfg_lot_rolls lr
      LEFT JOIN jsonb_array_elements(COALESCE(p_leftovers, '[]'::jsonb)) AS x(item)
        ON (x.item->>'lot_roll_id')::uuid = lr.id
     WHERE lr.lot_id = p_lot_id AND lr.cancelled_at IS NULL
     FOR UPDATE OF lr
  LOOP
    IF r.leftover > r.issued_meters + 0.0005 THEN
      RAISE EXCEPTION 'Leftover cannot be more than the % m issued', r.issued_meters;
    END IF;
    UPDATE public.mfg_lot_rolls
       SET leftover_meters = r.leftover,
           leftover_action = CASE WHEN r.leftover > 0 THEN v_action END
     WHERE id = r.id;
    IF v_action = 'stock' AND r.leftover > 0 THEN
      INSERT INTO public.mfg_fabric_ledger (organization_id, variant_id, entry_type, meters, lot_id, reason)
      VALUES (r.organization_id, r.variant_id, 'return', r.leftover, p_lot_id, 'Leftover back to stock from ' || v_lot.lot_no);
      IF NOT public._mfg_is_roll_size((SELECT size FROM public.product_variants WHERE id = r.variant_id)) THEN
        PERFORM public._mfg_move_variant_stock(r.variant_id, r.organization_id, r.leftover, p_lot_id, v_lot.lot_no,
                                               'Manufacturing: leftover back to stock from ' || v_lot.lot_no);
      END IF;
    END IF;
  END LOOP;

  -- Rolls with no metres left leave stock, so they cannot be sold as full rolls.
  FOR r IN
    SELECT DISTINCT pv.id, pv.size, COALESCE(pv.stock_qty, 0) AS stock_qty
      FROM public.mfg_lot_rolls lr
      JOIN public.product_variants pv ON pv.id = lr.variant_id
     WHERE lr.lot_id = p_lot_id AND lr.cancelled_at IS NULL
       AND public._mfg_is_roll_size(pv.size)
  LOOP
    v_left := btrim(r.size)::numeric * r.stock_qty - public._mfg_variant_meters_used(r.id);
    IF r.stock_qty > 0 AND v_left <= 0.0005 THEN
      PERFORM public._mfg_move_variant_stock(r.id, v_lot.organization_id, -r.stock_qty, p_lot_id, v_lot.lot_no,
                                             'Manufacturing: roll used up in ' || v_lot.lot_no);
    END IF;
  END LOOP;

  UPDATE public.mfg_lots
     SET status = 'cut',
         cut_at = now(),
         end_bits_action = v_action,
         cutting_worker_type = CASE WHEN p_worker_type IN ('employee', 'supplier') THEN p_worker_type END,
         cutting_employee_id = CASE WHEN p_worker_type = 'employee' THEN p_employee_id END,
         cutting_supplier_id = CASE WHEN p_worker_type = 'supplier' THEN p_supplier_id END,
         cutting_worker_name = NULLIF(btrim(COALESCE(p_worker_name, '')), ''),
         cutting_rate = GREATEST(COALESCE(p_rate, 0), 0)
   WHERE id = p_lot_id;
END;
$$;

-- 7. Finished pieces into stock ---------------------------------------------------------------
-- p_items = [{"lot_size_id": "...", "qty": 10}]
CREATE OR REPLACE FUNCTION public.mfg_finish_lot(
  p_lot_id uuid,
  p_items jsonb,
  p_cost_per_piece numeric,
  p_close boolean
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lot public.mfg_lots%ROWTYPE;
  v_cost numeric := round(GREATEST(COALESCE(p_cost_per_piece, 0), 0), 2);
  r record;
  v_cut numeric;
  v_done numeric;
  v_out numeric;
BEGIN
  SELECT * INTO v_lot FROM public.mfg_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot not found';
  END IF;
  IF v_lot.status <> 'cut' THEN
    RAISE EXCEPTION 'Save cutting first; finished lots cannot take more pieces';
  END IF;

  FOR r IN
    SELECT ls.id, ls.variant_id, GREATEST(COALESCE((x.item->>'qty')::numeric, 0), 0) AS qty
      FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS x(item)
      JOIN public.mfg_lot_sizes ls ON ls.id = (x.item->>'lot_size_id')::uuid AND ls.lot_id = p_lot_id
     WHERE COALESCE((x.item->>'qty')::numeric, 0) > 0
  LOOP
    PERFORM public._mfg_move_variant_stock(r.variant_id, v_lot.organization_id, r.qty, p_lot_id, v_lot.lot_no,
                                           'Manufacturing: ready pieces from ' || v_lot.lot_no);
    IF v_cost > 0 THEN
      UPDATE public.product_variants SET pur_price = v_cost WHERE id = r.variant_id;
    END IF;
    UPDATE public.mfg_lot_sizes SET finished_qty = finished_qty + r.qty WHERE id = r.id;
    INSERT INTO public.mfg_lot_finishes (organization_id, lot_id, variant_id, qty, cost_per_piece)
    VALUES (v_lot.organization_id, p_lot_id, r.variant_id, r.qty, v_cost);
  END LOOP;

  SELECT COALESCE(SUM(cut_qty), 0), COALESCE(SUM(finished_qty), 0) INTO v_cut, v_done
    FROM public.mfg_lot_sizes WHERE lot_id = p_lot_id;
  IF v_done > v_cut + 0.0005 THEN
    RAISE EXCEPTION 'Ready pieces (%) cannot be more than pieces cut (%)', v_done, v_cut;
  END IF;
  -- Only good pieces from the last stage can go into stock.
  v_out := public._mfg_stage_output(p_lot_id, COALESCE(array_length(v_lot.stage_ids, 1), 0));
  IF v_done > v_out + 0.0005 THEN
    RAISE EXCEPTION 'Only % good pieces came out of the last stage', round(v_out, 3);
  END IF;

  IF p_close THEN
    IF EXISTS (SELECT 1 FROM public.mfg_job_cards WHERE lot_id = p_lot_id AND status = 'open') THEN
      RAISE EXCEPTION 'Some pieces are still with workers; receive them or close their cards short first';
    END IF;
    UPDATE public.mfg_lots SET status = 'finished', finished_at = now() WHERE id = p_lot_id;
  END IF;
END;
$$;

-- 8. Fabric stock in metres (replaces phase 1): loose MTR metres now come off stock_qty when
--    issued, so for loose fabric stock_qty already is the metres left.
CREATE OR REPLACE FUNCTION public.get_mfg_fabric_stock(p_organization_id uuid)
RETURNS TABLE (
  variant_id uuid,
  product_id uuid,
  product_name text,
  color text,
  barcode text,
  is_roll boolean,
  roll_meters numeric,
  rolls_in_stock numeric,
  meters_purchased_in_stock numeric,
  meters_used numeric,
  meters_left numeric,
  pur_price numeric,
  stock_value numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH v AS (
    SELECT
      pv.id AS variant_id,
      p.id AS product_id,
      p.product_name,
      pv.color,
      pv.barcode,
      public._mfg_is_roll_size(pv.size) AS is_roll,
      CASE WHEN public._mfg_is_roll_size(pv.size) THEN btrim(pv.size)::numeric END AS roll_meters,
      GREATEST(COALESCE(pv.stock_qty, 0), 0) AS stock_qty,
      COALESCE(NULLIF(pv.pur_price, 0), p.default_pur_price, 0) AS pur_price
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.organization_id = p_organization_id
      AND p.organization_id = p_organization_id
      AND upper(COALESCE(p.uom, '')) = 'MTR'
      AND pv.deleted_at IS NULL
      AND p.deleted_at IS NULL
  ),
  used AS (
    SELECT l.variant_id, -SUM(l.signed_meters) AS meters_used
    FROM public.mfg_fabric_ledger l
    WHERE l.organization_id = p_organization_id
    GROUP BY l.variant_id
  ),
  calc AS (
    SELECT
      v.*,
      COALESCE(u.meters_used, 0) AS used_m,
      CASE
        WHEN v.is_roll THEN GREATEST(v.roll_meters * v.stock_qty - COALESCE(u.meters_used, 0), 0)
        ELSE v.stock_qty
      END AS left_m
    FROM v
    LEFT JOIN used u ON u.variant_id = v.variant_id
  )
  SELECT
    c.variant_id,
    c.product_id,
    c.product_name,
    c.color,
    c.barcode,
    c.is_roll,
    c.roll_meters,
    CASE WHEN c.is_roll THEN c.stock_qty END,
    CASE WHEN c.is_roll THEN c.roll_meters * c.stock_qty ELSE c.stock_qty + c.used_m END,
    c.used_m,
    c.left_m,
    c.pur_price,
    ROUND(c.left_m * c.pur_price, 2)
  FROM calc c
  WHERE c.stock_qty > 0
  ORDER BY c.product_name, c.color NULLS FIRST, c.roll_meters NULLS FIRST;
$$;

-- 9. Guards so pieces cannot appear from nowhere, even through direct table writes:
--    a lot's status only moves forward; pieces sent to a stage cannot be more than reached it;
--    pieces received cannot be more than are pending with the worker (the card closes itself
--    when everything is back); a card closed short cannot be short by more than was pending.
CREATE OR REPLACE FUNCTION public._mfg_guard_lot_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NOT (
       (OLD.status = 'open' AND NEW.status IN ('cut', 'cancelled'))
    OR (OLD.status = 'cut' AND NEW.status = 'finished')) THEN
    RAISE EXCEPTION 'Lot status cannot go from % to %', OLD.status, NEW.status;
  END IF;
  IF NEW.stage_ids IS DISTINCT FROM OLD.stage_ids AND OLD.status <> 'open' THEN
    RAISE EXCEPTION 'Stages cannot be changed after cutting is saved';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mfg_lots_guard ON public.mfg_lots;
CREATE TRIGGER mfg_lots_guard BEFORE UPDATE ON public.mfg_lots
  FOR EACH ROW EXECUTE FUNCTION public._mfg_guard_lot_status();

CREATE OR REPLACE FUNCTION public._mfg_guard_job_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lot public.mfg_lots%ROWTYPE;
  v_pos integer;
  v_in numeric;
  v_sent numeric;
  v_back numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.sent_qty <> OLD.sent_qty OR NEW.lot_id <> OLD.lot_id OR NEW.stage_id <> OLD.stage_id
       OR NEW.organization_id <> OLD.organization_id THEN
      RAISE EXCEPTION 'Sent pieces cannot be changed; close the card short and send again';
    END IF;
    IF NEW.closed_short_qty <> OLD.closed_short_qty THEN
      SELECT COALESCE(SUM(good_qty + rejected_qty + wasted_qty), 0) INTO v_back
        FROM public.mfg_job_receipts WHERE job_card_id = NEW.id;
      IF NEW.closed_short_qty + v_back > NEW.sent_qty + 0.0005 THEN
        RAISE EXCEPTION 'Only % pieces are pending with %', round(GREATEST(NEW.sent_qty - v_back, 0), 3), NEW.worker_name;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  SELECT * INTO v_lot FROM public.mfg_lots WHERE id = NEW.lot_id FOR UPDATE;
  IF NOT FOUND OR v_lot.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Lot not found';
  END IF;
  IF v_lot.status <> 'cut' THEN
    RAISE EXCEPTION 'Pieces can be sent only after cutting is saved and before the lot is finished';
  END IF;
  v_pos := array_position(v_lot.stage_ids, NEW.stage_id);
  IF v_pos IS NULL THEN
    RAISE EXCEPTION 'This stage is not part of lot %', v_lot.lot_no;
  END IF;
  v_in := public._mfg_stage_output(NEW.lot_id, v_pos - 1);
  SELECT COALESCE(SUM(sent_qty), 0) INTO v_sent
    FROM public.mfg_job_cards WHERE lot_id = NEW.lot_id AND stage_id = NEW.stage_id;
  IF v_sent + NEW.sent_qty > v_in + 0.0005 THEN
    RAISE EXCEPTION 'Only % pieces are ready for this stage', round(GREATEST(v_in - v_sent, 0), 3);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mfg_job_cards_guard ON public.mfg_job_cards;
CREATE TRIGGER mfg_job_cards_guard BEFORE INSERT OR UPDATE ON public.mfg_job_cards
  FOR EACH ROW EXECUTE FUNCTION public._mfg_guard_job_card();

CREATE OR REPLACE FUNCTION public._mfg_guard_job_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_card public.mfg_job_cards%ROWTYPE;
  v_status text;
  v_back numeric;
  v_left numeric;
  v_now numeric;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'A receipt cannot be changed; an admin can delete it and it can be entered again';
  END IF;
  SELECT * INTO v_card FROM public.mfg_job_cards WHERE id = NEW.job_card_id FOR UPDATE;
  IF NOT FOUND OR v_card.lot_id <> NEW.lot_id OR v_card.organization_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'Job card not found';
  END IF;
  IF v_card.status <> 'open' THEN
    RAISE EXCEPTION 'This job card is already closed';
  END IF;
  SELECT status INTO v_status FROM public.mfg_lots WHERE id = v_card.lot_id;
  IF v_status <> 'cut' THEN
    RAISE EXCEPTION 'This lot is not in process';
  END IF;
  SELECT COALESCE(SUM(good_qty + rejected_qty + wasted_qty), 0) INTO v_back
    FROM public.mfg_job_receipts WHERE job_card_id = NEW.job_card_id;
  v_left := v_card.sent_qty - v_back - v_card.closed_short_qty;
  v_now := COALESCE(NEW.good_qty, 0) + COALESCE(NEW.rejected_qty, 0) + COALESCE(NEW.wasted_qty, 0);
  IF v_now > v_left + 0.0005 THEN
    RAISE EXCEPTION 'Only % pieces are pending with %', round(GREATEST(v_left, 0), 3), v_card.worker_name;
  END IF;
  IF v_left - v_now <= 0.0005 THEN
    UPDATE public.mfg_job_cards SET status = 'closed' WHERE id = v_card.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mfg_job_receipts_guard ON public.mfg_job_receipts;
CREATE TRIGGER mfg_job_receipts_guard BEFORE INSERT OR UPDATE ON public.mfg_job_receipts
  FOR EACH ROW EXECUTE FUNCTION public._mfg_guard_job_receipt();

-- 10. Cancel a lot that is not cut yet: issued fabric goes back, in one step.
CREATE OR REPLACE FUNCTION public.mfg_cancel_lot(p_lot_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_lot public.mfg_lots%ROWTYPE;
  r record;
BEGIN
  SELECT * INTO v_lot FROM public.mfg_lots WHERE id = p_lot_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lot not found';
  END IF;
  IF v_lot.status <> 'open' THEN
    RAISE EXCEPTION 'Only a lot whose cutting is not saved can be cancelled';
  END IF;
  FOR r IN SELECT id FROM public.mfg_lot_rolls WHERE lot_id = p_lot_id AND cancelled_at IS NULL LOOP
    PERFORM public.mfg_cancel_fabric_issue(r.id);
  END LOOP;
  UPDATE public.mfg_lots SET status = 'cancelled' WHERE id = p_lot_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mfg_cancel_lot(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_create_lot(uuid, uuid, uuid, date, uuid[], text, uuid, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_issue_fabric(uuid, uuid, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_cancel_fabric_issue(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_save_cutting(uuid, jsonb, jsonb, text, text, uuid, uuid, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mfg_finish_lot(uuid, jsonb, numeric, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_mfg_fabric_stock(uuid) TO authenticated;
