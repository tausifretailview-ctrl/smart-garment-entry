-- Industrial mode, Phase 3 step 3a: godowns (stock places) inside one GSTIN.
--
-- New tables and functions only. No existing table, trigger, row or screen changes, so live
-- shops are not touched. Nothing is written until an Industrial mode shop opens the Godowns page.
--
-- How stock is kept:
--   * Each shop gets one "Main" godown (made the first time the Godowns page opens).
--   * Main is not stored per item: its stock is the item's shop stock (product_variants.stock_qty,
--     kept exactly as today by the sale / purchase / return triggers) minus what sits in the
--     other godowns. So every bill, return and stock reconciliation keeps working as today and
--     acts on Main until a later step lets a bill pick its godown.
--   * Other godowns (godown, job worker, damaged) hold their stock in godown_stock, changed only
--     by godown_move_stock / godown_cancel_move, which check the stock that is there first.
--   * The shop's total stock never changes when goods move between godowns.
--
-- Writes go only through the functions below (no insert / update / delete policies), so the
-- checks cannot be skipped. Members of the shop can read.

-- 1. Tables -----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.godowns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  code text,
  godown_type text NOT NULL DEFAULT 'godown',
  address text,
  pincode text,
  contact_name text,
  contact_phone text,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT godowns_type_check CHECK (godown_type IN ('main', 'godown', 'job_work', 'damaged')),
  CONSTRAINT godowns_name_check CHECK (length(btrim(name)) BETWEEN 1 AND 60)
);

CREATE UNIQUE INDEX IF NOT EXISTS godowns_one_main_per_org
  ON public.godowns (organization_id)
  WHERE godown_type = 'main';

CREATE UNIQUE INDEX IF NOT EXISTS godowns_org_name_key
  ON public.godowns (organization_id, lower(btrim(name)));

COMMENT ON TABLE public.godowns IS
  'Industrial mode: stock places in one GSTIN. type main | godown | job_work | damaged. Main stock = shop stock minus the other godowns.';

CREATE TABLE IF NOT EXISTS public.godown_stock (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  godown_id uuid NOT NULL REFERENCES public.godowns(id),
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  qty numeric(14,3) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (godown_id, variant_id),
  CONSTRAINT godown_stock_qty_check CHECK (qty >= 0)
);

CREATE INDEX IF NOT EXISTS idx_godown_stock_org_variant
  ON public.godown_stock (organization_id, variant_id);

COMMENT ON TABLE public.godown_stock IS
  'Industrial mode: stock of each item in each godown other than Main. Written only by godown_move_stock / godown_cancel_move.';

CREATE TABLE IF NOT EXISTS public.godown_moves (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  move_no text,
  move_date date NOT NULL DEFAULT CURRENT_DATE,
  from_godown_id uuid NOT NULL REFERENCES public.godowns(id),
  to_godown_id uuid NOT NULL REFERENCES public.godowns(id),
  ref_type text NOT NULL DEFAULT 'transfer',
  ref_id uuid,
  ref_no text,
  note text,
  transport jsonb,
  total_qty numeric(14,3) NOT NULL DEFAULT 0,
  total_value numeric(14,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'done',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid,
  CONSTRAINT godown_moves_status_check CHECK (status IN ('done', 'cancelled')),
  CONSTRAINT godown_moves_ref_type_check CHECK (
    ref_type IN ('transfer', 'opening', 'purchase', 'purchase_return', 'sale', 'sale_return', 'challan', 'adjust')
  ),
  CONSTRAINT godown_moves_places_check CHECK (from_godown_id <> to_godown_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS godown_moves_org_no_key
  ON public.godown_moves (organization_id, move_no)
  WHERE move_no IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_godown_moves_org_date
  ON public.godown_moves (organization_id, move_date DESC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_godown_moves_ref
  ON public.godown_moves (ref_id)
  WHERE ref_id IS NOT NULL;

COMMENT ON TABLE public.godown_moves IS
  'Industrial mode: goods moved between godowns (GT/yy-yy/n for transfers). ref_type says which document moved them.';

CREATE TABLE IF NOT EXISTS public.godown_move_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  move_id uuid NOT NULL REFERENCES public.godown_moves(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  product_id uuid,
  qty numeric(14,3) NOT NULL,
  rate numeric(14,2) NOT NULL DEFAULT 0,
  value numeric(14,2) NOT NULL DEFAULT 0,
  CONSTRAINT godown_move_items_qty_check CHECK (qty > 0)
);

CREATE INDEX IF NOT EXISTS idx_godown_move_items_move
  ON public.godown_move_items (move_id);

CREATE INDEX IF NOT EXISTS idx_godown_move_items_variant
  ON public.godown_move_items (organization_id, variant_id);

-- 2. Row level security: shop members read; writes only through the functions below. --------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['godowns', 'godown_stock', 'godown_moves', 'godown_move_items']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
         EXISTS (SELECT 1 FROM public.organization_members om
                 WHERE om.organization_id = %I.organization_id AND om.user_id = auth.uid()))',
      t || '_select', t, t);
  END LOOP;
END;
$$;

-- 3. Who may change godowns: shop admin or manager (or platform admin). ---------------------
CREATE OR REPLACE FUNCTION public._godown_can_manage(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
     WHERE om.organization_id = p_organization_id
       AND om.user_id = auth.uid()
       AND om.role IN ('admin'::public.app_role, 'manager'::public.app_role)
  ) OR public.has_role(auth.uid(), 'platform_admin'::public.app_role);
$$;

-- 4. Main godown: made once per shop, named "Main", with the shop address. -------------------
CREATE OR REPLACE FUNCTION public.godown_ensure_main(p_organization_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_name text := 'Main';
  v_address text;
BEGIN
  PERFORM public._assert_org_access(p_organization_id);
  SELECT id INTO v_id FROM public.godowns WHERE organization_id = p_organization_id AND godown_type = 'main';
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.godowns WHERE organization_id = p_organization_id AND lower(btrim(name)) = 'main') THEN
    v_name := 'Main shop';
  END IF;
  SELECT s.address INTO v_address FROM public.settings s WHERE s.organization_id = p_organization_id LIMIT 1;
  INSERT INTO public.godowns (organization_id, name, godown_type, address, sort_order, created_by)
  VALUES (p_organization_id, v_name, 'main', NULLIF(btrim(COALESCE(v_address, '')), ''), 0, auth.uid())
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM public.godowns WHERE organization_id = p_organization_id AND godown_type = 'main';
  END IF;
  RETURN v_id;
END;
$$;

-- 5. Add or edit a godown. Main keeps its type and stays open; a godown with stock can't close.
CREATE OR REPLACE FUNCTION public.godown_save(
  p_organization_id uuid,
  p_id uuid,
  p_name text,
  p_code text,
  p_type text,
  p_address text,
  p_pincode text,
  p_contact_name text,
  p_contact_phone text,
  p_supplier_id uuid,
  p_notes text,
  p_is_active boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.godowns%ROWTYPE;
  v_name text := btrim(COALESCE(p_name, ''));
  v_type text := COALESCE(NULLIF(btrim(p_type), ''), 'godown');
  v_pin text := NULLIF(regexp_replace(COALESCE(p_pincode, ''), '\s', '', 'g'), '');
  v_active boolean := COALESCE(p_is_active, true);
  v_id uuid;
BEGIN
  PERFORM public._assert_org_access(p_organization_id);
  IF NOT public._godown_can_manage(p_organization_id) THEN
    RAISE EXCEPTION 'Only an admin or manager can add or change godowns';
  END IF;
  IF length(v_name) = 0 THEN
    RAISE EXCEPTION 'Give the godown a name';
  END IF;
  IF length(v_name) > 60 THEN
    RAISE EXCEPTION 'Keep the godown name to 60 letters';
  END IF;
  IF v_pin IS NOT NULL AND v_pin !~ '^[1-9][0-9]{5}$' THEN
    RAISE EXCEPTION 'PIN code must be 6 digits';
  END IF;
  IF p_supplier_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.suppliers WHERE id = p_supplier_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'Pick the job worker from your Supplier Master';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.godowns
     WHERE organization_id = p_organization_id
       AND lower(btrim(name)) = lower(v_name)
       AND (p_id IS NULL OR id <> p_id)
  ) THEN
    RAISE EXCEPTION 'A godown named % already exists', v_name;
  END IF;

  IF p_id IS NULL THEN
    IF v_type NOT IN ('godown', 'job_work', 'damaged') THEN
      RAISE EXCEPTION 'Pick the godown type';
    END IF;
    INSERT INTO public.godowns (organization_id, name, code, godown_type, address, pincode, contact_name, contact_phone,
                                supplier_id, notes, is_active, sort_order, created_by)
    VALUES (p_organization_id, v_name, NULLIF(btrim(COALESCE(p_code, '')), ''), v_type,
            NULLIF(btrim(COALESCE(p_address, '')), ''), v_pin,
            NULLIF(btrim(COALESCE(p_contact_name, '')), ''), NULLIF(btrim(COALESCE(p_contact_phone, '')), ''),
            CASE WHEN v_type = 'job_work' THEN p_supplier_id END,
            NULLIF(btrim(COALESCE(p_notes, '')), ''), true,
            (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM public.godowns WHERE organization_id = p_organization_id),
            auth.uid())
    RETURNING id INTO v_id;
    RETURN v_id;
  END IF;

  SELECT * INTO v_row FROM public.godowns WHERE id = p_id AND organization_id = p_organization_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Godown not found';
  END IF;
  IF v_row.godown_type = 'main' THEN
    v_type := 'main';
    v_active := true;
  ELSIF v_type NOT IN ('godown', 'job_work', 'damaged') THEN
    RAISE EXCEPTION 'Pick the godown type';
  END IF;
  IF NOT v_active AND v_row.is_active AND EXISTS (
    SELECT 1 FROM public.godown_stock WHERE godown_id = p_id AND qty > 0
  ) THEN
    RAISE EXCEPTION 'Move the stock out of % before closing it', v_row.name;
  END IF;
  UPDATE public.godowns
     SET name = v_name,
         code = NULLIF(btrim(COALESCE(p_code, '')), ''),
         godown_type = v_type,
         address = NULLIF(btrim(COALESCE(p_address, '')), ''),
         pincode = v_pin,
         contact_name = NULLIF(btrim(COALESCE(p_contact_name, '')), ''),
         contact_phone = NULLIF(btrim(COALESCE(p_contact_phone, '')), ''),
         supplier_id = CASE WHEN v_type = 'job_work' THEN p_supplier_id END,
         notes = NULLIF(btrim(COALESCE(p_notes, '')), ''),
         is_active = v_active,
         updated_at = now()
   WHERE id = p_id;
  RETURN p_id;
END;
$$;

-- 6. Move goods from one godown to another. Checks the stock in the godown they leave
--    (Main may go below zero only where Settings > Sale allows sale without stock).
--    p_lines: [{ "variant_id": uuid, "qty": number, "rate": number (optional) }]
CREATE OR REPLACE FUNCTION public.godown_move_stock(
  p_organization_id uuid,
  p_from_godown_id uuid,
  p_to_godown_id uuid,
  p_move_date date,
  p_lines jsonb,
  p_ref_type text,
  p_ref_id uuid,
  p_ref_no text,
  p_note text,
  p_transport jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from public.godowns%ROWTYPE;
  v_to public.godowns%ROWTYPE;
  v_ref text := COALESCE(NULLIF(btrim(p_ref_type), ''), 'transfer');
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  v_date date := COALESCE(p_move_date, (now() AT TIME ZONE 'Asia/Kolkata')::date);
  v_neg boolean;
  v_move_id uuid;
  v_no text;
  v_fy text;
  v_next integer;
  r record;
  v_pv record;
  v_label text;
  v_avail numeric;
  v_rate numeric;
  v_total_qty numeric := 0;
  v_total_value numeric := 0;
  v_lines integer := 0;
BEGIN
  PERFORM public._assert_org_access(p_organization_id);
  IF v_ref NOT IN ('transfer', 'opening', 'purchase', 'purchase_return', 'sale', 'sale_return', 'challan', 'adjust') THEN
    RAISE EXCEPTION 'Unknown kind of godown move: %', v_ref;
  END IF;
  IF v_date > v_today THEN
    RAISE EXCEPTION 'The date is in the future';
  END IF;
  SELECT * INTO v_from FROM public.godowns WHERE id = p_from_godown_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pick the godown the goods go out of';
  END IF;
  SELECT * INTO v_to FROM public.godowns WHERE id = p_to_godown_id AND organization_id = p_organization_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pick the godown the goods go into';
  END IF;
  IF v_from.id = v_to.id THEN
    RAISE EXCEPTION 'From and To must be different godowns';
  END IF;
  IF NOT v_to.is_active THEN
    RAISE EXCEPTION 'Godown % is closed', v_to.name;
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Add at least one item';
  END IF;
  v_neg := public.org_allows_negative_stock(p_organization_id);

  IF v_ref IN ('transfer', 'opening') THEN
    PERFORM pg_advisory_xact_lock(hashtext('godown_move_no:' || p_organization_id::text));
    v_fy := CASE
      WHEN extract(month FROM v_date) >= 4
        THEN to_char(v_date, 'YY') || '-' || to_char(v_date + interval '1 year', 'YY')
      ELSE to_char(v_date - interval '1 year', 'YY') || '-' || to_char(v_date, 'YY')
    END;
    SELECT COALESCE(MAX((regexp_match(move_no, '^GT/' || v_fy || '/([0-9]+)$'))[1]::integer), 0) + 1
      INTO v_next
      FROM public.godown_moves
     WHERE organization_id = p_organization_id AND move_no LIKE 'GT/' || v_fy || '/%';
    v_no := 'GT/' || v_fy || '/' || v_next;
  END IF;

  INSERT INTO public.godown_moves (organization_id, move_no, move_date, from_godown_id, to_godown_id, ref_type, ref_id,
                                   ref_no, note, transport, created_by)
  VALUES (p_organization_id, v_no, v_date, v_from.id, v_to.id, v_ref, p_ref_id,
          NULLIF(btrim(COALESCE(p_ref_no, '')), ''), NULLIF(btrim(COALESCE(p_note, '')), ''),
          CASE WHEN jsonb_typeof(p_transport) = 'object' THEN p_transport END, auth.uid())
  RETURNING id INTO v_move_id;

  FOR r IN
    SELECT l.variant_id, SUM(l.qty) AS qty, MAX(l.rate) AS rate
      FROM jsonb_to_recordset(p_lines) AS l(variant_id uuid, qty numeric, rate numeric)
     GROUP BY l.variant_id
     ORDER BY l.variant_id
  LOOP
    IF r.variant_id IS NULL OR COALESCE(r.qty, 0) <= 0 THEN
      RAISE EXCEPTION 'Each line needs an item and a quantity above 0';
    END IF;
    SELECT pv.id, pv.product_id, pv.stock_qty, pv.pur_price, pv.size, pv.color,
           p.product_name, p.default_pur_price, p.product_type
      INTO v_pv
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
     WHERE pv.id = r.variant_id
       AND pv.organization_id = p_organization_id
       AND pv.deleted_at IS NULL
       FOR UPDATE OF pv;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'An item on this list was not found in this shop';
    END IF;
    v_label := v_pv.product_name
      || CASE WHEN NULLIF(btrim(COALESCE(v_pv.color, '')), '') IS NOT NULL THEN ' ' || btrim(v_pv.color) ELSE '' END
      || CASE WHEN NULLIF(btrim(COALESCE(v_pv.size, '')), '') IS NOT NULL
                AND upper(btrim(v_pv.size)) NOT IN ('FREE', 'NONE', 'NA', '-')
              THEN ' / ' || btrim(v_pv.size) ELSE '' END;
    IF COALESCE(v_pv.product_type, '') IN ('service', 'combo') THEN
      RAISE EXCEPTION '% is a service or combo; it has no stock to move', v_label;
    END IF;

    IF v_from.godown_type = 'main' THEN
      SELECT COALESCE(v_pv.stock_qty, 0) - COALESCE(SUM(gs.qty), 0)
        INTO v_avail
        FROM public.godown_stock gs
       WHERE gs.organization_id = p_organization_id AND gs.variant_id = r.variant_id;
      IF r.qty > v_avail AND NOT v_neg THEN
        RAISE EXCEPTION 'Only % of % is in %', round(GREATEST(v_avail, 0), 3), v_label, v_from.name;
      END IF;
    ELSE
      SELECT gs.qty INTO v_avail
        FROM public.godown_stock gs
       WHERE gs.godown_id = v_from.id AND gs.variant_id = r.variant_id
         FOR UPDATE;
      v_avail := COALESCE(v_avail, 0);
      IF r.qty > v_avail THEN
        RAISE EXCEPTION 'Only % of % is in %', round(v_avail, 3), v_label, v_from.name;
      END IF;
      UPDATE public.godown_stock
         SET qty = qty - r.qty, updated_at = now()
       WHERE godown_id = v_from.id AND variant_id = r.variant_id;
      DELETE FROM public.godown_stock WHERE godown_id = v_from.id AND variant_id = r.variant_id AND qty = 0;
    END IF;

    IF v_to.godown_type <> 'main' THEN
      INSERT INTO public.godown_stock AS gs (organization_id, godown_id, variant_id, qty)
      VALUES (p_organization_id, v_to.id, r.variant_id, r.qty)
      ON CONFLICT (godown_id, variant_id)
      DO UPDATE SET qty = gs.qty + EXCLUDED.qty, updated_at = now();
    END IF;

    v_rate := COALESCE(NULLIF(r.rate, 0), NULLIF(v_pv.pur_price, 0), v_pv.default_pur_price, 0);
    INSERT INTO public.godown_move_items (move_id, organization_id, variant_id, product_id, qty, rate, value)
    VALUES (v_move_id, p_organization_id, r.variant_id, v_pv.product_id, r.qty, round(v_rate, 2), round(r.qty * v_rate, 2));
    v_total_qty := v_total_qty + r.qty;
    v_total_value := v_total_value + round(r.qty * v_rate, 2);
    v_lines := v_lines + 1;
  END LOOP;

  UPDATE public.godown_moves SET total_qty = v_total_qty, total_value = v_total_value WHERE id = v_move_id;
  RETURN jsonb_build_object('id', v_move_id, 'move_no', v_no, 'lines', v_lines, 'total_qty', v_total_qty, 'total_value', v_total_value);
END;
$$;

-- 7. Cancel a transfer: the goods go back where they came from, if they are still there. -----
CREATE OR REPLACE FUNCTION public.godown_cancel_move(p_move_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_move public.godown_moves%ROWTYPE;
  v_from public.godowns%ROWTYPE;
  v_to public.godowns%ROWTYPE;
  v_neg boolean;
  r record;
  v_avail numeric;
BEGIN
  SELECT * INTO v_move FROM public.godown_moves WHERE id = p_move_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;
  PERFORM public._assert_org_access(v_move.organization_id);
  IF NOT public._godown_can_manage(v_move.organization_id) THEN
    RAISE EXCEPTION 'Only an admin or manager can cancel a transfer';
  END IF;
  IF v_move.status <> 'done' THEN
    RAISE EXCEPTION 'This transfer is already cancelled';
  END IF;
  IF v_move.ref_type NOT IN ('transfer', 'opening') THEN
    RAISE EXCEPTION 'These goods moved with % %; change that document instead', replace(v_move.ref_type, '_', ' '), COALESCE(v_move.ref_no, '');
  END IF;
  SELECT * INTO v_from FROM public.godowns WHERE id = v_move.from_godown_id;
  SELECT * INTO v_to FROM public.godowns WHERE id = v_move.to_godown_id;
  v_neg := public.org_allows_negative_stock(v_move.organization_id);

  FOR r IN
    SELECT i.variant_id, SUM(i.qty) AS qty,
           MAX(p.product_name
               || CASE WHEN NULLIF(btrim(COALESCE(pv.color, '')), '') IS NOT NULL THEN ' ' || btrim(pv.color) ELSE '' END
               || CASE WHEN NULLIF(btrim(COALESCE(pv.size, '')), '') IS NOT NULL
                         AND upper(btrim(pv.size)) NOT IN ('FREE', 'NONE', 'NA', '-')
                       THEN ' / ' || btrim(pv.size) ELSE '' END) AS product_name
      FROM public.godown_move_items i
      JOIN public.product_variants pv ON pv.id = i.variant_id
      JOIN public.products p ON p.id = pv.product_id
     WHERE i.move_id = p_move_id
     GROUP BY i.variant_id
     ORDER BY i.variant_id
  LOOP
    PERFORM 1 FROM public.product_variants WHERE id = r.variant_id FOR UPDATE;
    IF v_to.godown_type = 'main' THEN
      SELECT COALESCE(pv.stock_qty, 0) - COALESCE((SELECT SUM(gs.qty) FROM public.godown_stock gs
                                                    WHERE gs.organization_id = v_move.organization_id
                                                      AND gs.variant_id = r.variant_id), 0)
        INTO v_avail
        FROM public.product_variants pv WHERE pv.id = r.variant_id;
      IF r.qty > v_avail AND NOT v_neg THEN
        RAISE EXCEPTION 'Only % of % is left in %, so this transfer cannot be cancelled', round(GREATEST(v_avail, 0), 3), r.product_name, v_to.name;
      END IF;
    ELSE
      SELECT gs.qty INTO v_avail FROM public.godown_stock gs
       WHERE gs.godown_id = v_to.id AND gs.variant_id = r.variant_id FOR UPDATE;
      v_avail := COALESCE(v_avail, 0);
      IF r.qty > v_avail THEN
        RAISE EXCEPTION 'Only % of % is left in %, so this transfer cannot be cancelled', round(v_avail, 3), r.product_name, v_to.name;
      END IF;
      UPDATE public.godown_stock SET qty = qty - r.qty, updated_at = now()
       WHERE godown_id = v_to.id AND variant_id = r.variant_id;
      DELETE FROM public.godown_stock WHERE godown_id = v_to.id AND variant_id = r.variant_id AND qty = 0;
    END IF;
    IF v_from.godown_type <> 'main' THEN
      INSERT INTO public.godown_stock AS gs (organization_id, godown_id, variant_id, qty)
      VALUES (v_move.organization_id, v_from.id, r.variant_id, r.qty)
      ON CONFLICT (godown_id, variant_id)
      DO UPDATE SET qty = gs.qty + EXCLUDED.qty, updated_at = now();
    END IF;
  END LOOP;

  UPDATE public.godown_moves
     SET status = 'cancelled', cancelled_at = now(), cancelled_by = auth.uid()
   WHERE id = p_move_id;
END;
$$;

-- 8. Godown cards: items with stock, quantity and value (at purchase rate) per godown. -------
CREATE OR REPLACE FUNCTION public.get_godown_summary(p_organization_id uuid)
RETURNS TABLE (
  godown_id uuid,
  items integer,
  qty numeric,
  stock_value numeric,
  short_items integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_org_access(p_organization_id);
  RETURN QUERY
  WITH o AS (
    SELECT gs.variant_id, SUM(gs.qty) AS qty
      FROM public.godown_stock gs
     WHERE gs.organization_id = p_organization_id
     GROUP BY gs.variant_id
  ),
  v AS (
    SELECT pv.id,
           COALESCE(pv.stock_qty, 0)::numeric AS stock_qty,
           COALESCE(NULLIF(pv.pur_price, 0), p.default_pur_price, 0)::numeric AS rate
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
     WHERE pv.organization_id = p_organization_id
       AND pv.deleted_at IS NULL
       AND p.deleted_at IS NULL
       AND COALESCE(p.product_type, '') NOT IN ('service', 'combo')
  ),
  m AS (
    SELECT v.stock_qty - COALESCE(o.qty, 0) AS q, v.rate
      FROM v LEFT JOIN o ON o.variant_id = v.id
  )
  SELECT g.id,
         (SELECT COUNT(*) FROM m WHERE m.q > 0)::integer,
         COALESCE((SELECT SUM(m.q) FROM m WHERE m.q > 0), 0)::numeric,
         COALESCE((SELECT round(SUM(m.q * m.rate), 2) FROM m WHERE m.q > 0), 0)::numeric,
         (SELECT COUNT(*) FROM m WHERE m.q < 0)::integer
    FROM public.godowns g
   WHERE g.organization_id = p_organization_id AND g.godown_type = 'main'
  UNION ALL
  SELECT gs.godown_id,
         COUNT(*) FILTER (WHERE gs.qty > 0)::integer,
         COALESCE(SUM(gs.qty), 0)::numeric,
         COALESCE(round(SUM(gs.qty * COALESCE(v.rate, 0)), 2), 0)::numeric,
         0
    FROM public.godown_stock gs
    LEFT JOIN v ON v.id = gs.variant_id
   WHERE gs.organization_id = p_organization_id
   GROUP BY gs.godown_id;
END;
$$;

-- 9. Stock in one godown, a page at a time, with search. Main shows items below zero too. -----
CREATE OR REPLACE FUNCTION public.get_godown_stock(
  p_organization_id uuid,
  p_godown_id uuid,
  p_search text,
  p_limit integer,
  p_offset integer
)
RETURNS TABLE (
  variant_id uuid,
  product_id uuid,
  product_name text,
  brand text,
  category text,
  size text,
  color text,
  barcode text,
  uom text,
  qty numeric,
  rate numeric,
  stock_value numeric,
  shop_qty numeric,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type text;
  v_q text := NULLIF(btrim(COALESCE(p_search, '')), '');
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 2000);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  PERFORM public._assert_org_access(p_organization_id);
  SELECT g.godown_type INTO v_type FROM public.godowns g WHERE g.id = p_godown_id AND g.organization_id = p_organization_id;
  IF v_type IS NULL THEN
    RAISE EXCEPTION 'Godown not found';
  END IF;

  IF v_type = 'main' THEN
    RETURN QUERY
    WITH o AS (
      SELECT gs.variant_id, SUM(gs.qty) AS qty
        FROM public.godown_stock gs
       WHERE gs.organization_id = p_organization_id
       GROUP BY gs.variant_id
    ),
    st AS (
      SELECT pv.id AS vid, p.id AS pid, p.product_name AS pname, p.brand AS pbrand, p.category AS pcat,
             pv.size AS vsize, pv.color AS vcolor, pv.barcode AS vbarcode, p.uom AS puom,
             (COALESCE(pv.stock_qty, 0) - COALESCE(o.qty, 0))::numeric AS q,
             COALESCE(NULLIF(pv.pur_price, 0), p.default_pur_price, 0)::numeric AS r,
             COALESCE(pv.stock_qty, 0)::numeric AS shop
        FROM public.product_variants pv
        JOIN public.products p ON p.id = pv.product_id
        LEFT JOIN o ON o.variant_id = pv.id
       WHERE pv.organization_id = p_organization_id
         AND pv.deleted_at IS NULL
         AND p.deleted_at IS NULL
         AND COALESCE(p.product_type, '') NOT IN ('service', 'combo')
         AND (v_q IS NULL
              OR p.product_name ILIKE '%' || v_q || '%'
              OR COALESCE(pv.barcode, '') ILIKE '%' || v_q || '%'
              OR COALESCE(p.brand, '') ILIKE '%' || v_q || '%'
              OR COALESCE(p.category, '') ILIKE '%' || v_q || '%'
              OR COALESCE(pv.color, '') ILIKE '%' || v_q || '%'
              OR COALESCE(p.style, '') ILIKE '%' || v_q || '%')
    )
    SELECT st.vid, st.pid, st.pname, st.pbrand, st.pcat, st.vsize, st.vcolor, st.vbarcode, st.puom,
           st.q, st.r, round(st.q * st.r, 2), st.shop, COUNT(*) OVER ()
      FROM st
     WHERE st.q <> 0
     ORDER BY st.pname, st.vcolor NULLS FIRST, st.vsize NULLS FIRST
     LIMIT v_limit OFFSET v_offset;
  ELSE
    RETURN QUERY
    SELECT pv.id, p.id, p.product_name, p.brand, p.category, pv.size, pv.color, pv.barcode, p.uom,
           gs.qty::numeric,
           COALESCE(NULLIF(pv.pur_price, 0), p.default_pur_price, 0)::numeric,
           round(gs.qty * COALESCE(NULLIF(pv.pur_price, 0), p.default_pur_price, 0), 2)::numeric,
           COALESCE(pv.stock_qty, 0)::numeric,
           COUNT(*) OVER ()
      FROM public.godown_stock gs
      JOIN public.product_variants pv ON pv.id = gs.variant_id
      JOIN public.products p ON p.id = pv.product_id
     WHERE gs.godown_id = p_godown_id
       AND gs.qty > 0
       AND (v_q IS NULL
            OR p.product_name ILIKE '%' || v_q || '%'
            OR COALESCE(pv.barcode, '') ILIKE '%' || v_q || '%'
            OR COALESCE(p.brand, '') ILIKE '%' || v_q || '%'
            OR COALESCE(p.category, '') ILIKE '%' || v_q || '%'
            OR COALESCE(pv.color, '') ILIKE '%' || v_q || '%'
            OR COALESCE(p.style, '') ILIKE '%' || v_q || '%')
     ORDER BY p.product_name, pv.color NULLS FIRST, pv.size NULLS FIRST
     LIMIT v_limit OFFSET v_offset;
  END IF;
END;
$$;

-- 10. Stock of given items in every godown (Main worked out), for the transfer and bill screens.
CREATE OR REPLACE FUNCTION public.get_variant_godown_qty(p_organization_id uuid, p_variant_ids uuid[])
RETURNS TABLE (
  variant_id uuid,
  godown_id uuid,
  qty numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._assert_org_access(p_organization_id);
  RETURN QUERY
  SELECT gs.variant_id, gs.godown_id, gs.qty::numeric
    FROM public.godown_stock gs
   WHERE gs.organization_id = p_organization_id
     AND gs.variant_id = ANY (COALESCE(p_variant_ids, ARRAY[]::uuid[]))
     AND gs.qty <> 0
  UNION ALL
  SELECT pv.id, g.id,
         (COALESCE(pv.stock_qty, 0) - COALESCE((SELECT SUM(x.qty) FROM public.godown_stock x
                                                 WHERE x.organization_id = p_organization_id
                                                   AND x.variant_id = pv.id), 0))::numeric
    FROM public.product_variants pv
    JOIN public.godowns g ON g.organization_id = p_organization_id AND g.godown_type = 'main'
   WHERE pv.organization_id = p_organization_id
     AND pv.id = ANY (COALESCE(p_variant_ids, ARRAY[]::uuid[]));
END;
$$;

-- 11. Grants: logged-in users call the functions (each checks the shop); nobody else. --------
REVOKE ALL ON FUNCTION public._godown_can_manage(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.godown_ensure_main(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.godown_save(uuid, uuid, text, text, text, text, text, text, text, uuid, text, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.godown_move_stock(uuid, uuid, uuid, date, jsonb, text, uuid, text, text, jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.godown_cancel_move(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_godown_summary(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_godown_stock(uuid, uuid, text, integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_variant_godown_qty(uuid, uuid[]) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public._godown_can_manage(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.godown_ensure_main(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.godown_save(uuid, uuid, text, text, text, text, text, text, text, uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.godown_move_stock(uuid, uuid, uuid, date, jsonb, text, uuid, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.godown_cancel_move(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_godown_summary(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_godown_stock(uuid, uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_variant_godown_qty(uuid, uuid[]) TO authenticated;

NOTIFY pgrst, 'reload schema';
