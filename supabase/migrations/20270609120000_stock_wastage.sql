-- Wastage / damage entry (supermarket phase 2, Nov 2026).
--
-- Breakage, spoilage, expiry, theft or shrinkage taken out of stock with a reason, its cost,
-- and a report. Stock Adjustment only corrected figures; it kept no reason or value.
--
-- record_stock_wastage(org, lines, notes): one document (WST-…) of one or more lines, in one
-- transaction:
--   * each item row is locked; stock and opening move together, exactly like Stock
--     Adjustment, so stock reconciliation and the drift checks stay balanced;
--   * the shop's negative-stock rule (trigger on product_variants) still applies;
--   * one stock_movements row per line ('reconciliation', note "Wastage: …"), which the
--     accounts already post as a stock adjustment valued at the purchase price;
--   * one stock_wastage row per line with the reason, quantity and cost (purchase price at
--     the time × quantity).
-- reverse_stock_wastage(org, doc): a wrong entry is put back (stock returns, rows marked).
-- SECURITY INVOKER + membership check. Safe to run more than once.

CREATE TABLE IF NOT EXISTS public.stock_wastage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  doc_number text NOT NULL,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  reason text NOT NULL CHECK (reason IN ('breakage', 'spoilage', 'expired', 'theft', 'shrinkage', 'damaged', 'other')),
  unit_cost numeric(12,2) NOT NULL DEFAULT 0,
  cost_value numeric(14,2) NOT NULL DEFAULT 0,
  notes text,
  wasted_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid(),
  reversed_at timestamptz,
  reversed_by uuid
);

CREATE INDEX IF NOT EXISTS stock_wastage_org_date_idx ON public.stock_wastage (organization_id, wasted_on DESC);
CREATE INDEX IF NOT EXISTS stock_wastage_doc_idx ON public.stock_wastage (organization_id, doc_number);
CREATE INDEX IF NOT EXISTS stock_wastage_variant_idx ON public.stock_wastage (variant_id);

ALTER TABLE public.stock_wastage ENABLE ROW LEVEL SECURITY;

-- Read by members; written only through the functions below (no direct insert/update policy).
DROP POLICY IF EXISTS "Members read wastage" ON public.stock_wastage;
CREATE POLICY "Members read wastage" ON public.stock_wastage FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));
DROP POLICY IF EXISTS "Members write wastage" ON public.stock_wastage;
CREATE POLICY "Members write wastage" ON public.stock_wastage FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

GRANT SELECT, INSERT, UPDATE ON public.stock_wastage TO authenticated;

CREATE OR REPLACE FUNCTION public.record_stock_wastage(
  p_organization_id uuid,
  p_lines jsonb,            -- [{ "variant_id": uuid, "quantity": n, "reason": text, "notes": text? }]
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_doc text;
  v_line jsonb;
  v_variant uuid;
  v_qty numeric;
  v_reason text;
  v_row record;
  v_total_qty numeric := 0;
  v_total_cost numeric := 0;
  v_count int := 0;
  v_note text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Add at least one item' USING ERRCODE = '22023';
  END IF;

  v_doc := 'WST-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD-HH24MISS');

  -- Lock every item first, lowest id first, so two entries never wait on each other.
  PERFORM 1 FROM product_variants
  WHERE organization_id = p_organization_id
    AND id IN (SELECT (l ->> 'variant_id')::uuid FROM jsonb_array_elements(p_lines) l)
  ORDER BY id
  FOR UPDATE;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_variant := (v_line ->> 'variant_id')::uuid;
    v_qty := (v_line ->> 'quantity')::numeric;
    v_reason := coalesce(nullif(btrim(v_line ->> 'reason'), ''), 'other');
    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be more than 0' USING ERRCODE = '22023';
    END IF;
    IF v_reason NOT IN ('breakage', 'spoilage', 'expired', 'theft', 'shrinkage', 'damaged', 'other') THEN
      RAISE EXCEPTION 'Unknown reason %', v_reason USING ERRCODE = '22023';
    END IF;

    SELECT v.id, coalesce(v.stock_qty, 0) AS stock_qty, coalesce(v.opening_qty, 0) AS opening_qty,
           coalesce(v.pur_price, 0) AS pur_price, p.product_name, v.size
    INTO v_row
    FROM product_variants v JOIN products p ON p.id = v.product_id
    WHERE v.id = v_variant AND v.organization_id = p_organization_id AND v.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002';
    END IF;

    UPDATE product_variants
    SET stock_qty = coalesce(stock_qty, 0) - v_qty,
        opening_qty = coalesce(opening_qty, 0) - v_qty,
        updated_at = now()
    WHERE id = v_variant AND organization_id = p_organization_id;

    v_note := 'Wastage (' || v_reason || '): ' || v_row.product_name
           || CASE WHEN v_row.size IS NOT NULL AND v_row.size <> 'None' THEN ' ' || v_row.size ELSE '' END
           || ' −' || trim_scale(v_qty)
           || coalesce(' · ' || nullif(btrim(coalesce(v_line ->> 'notes', p_notes)), ''), '');

    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, notes, user_id, bill_number)
    VALUES (v_variant, p_organization_id, 'reconciliation', -v_qty, v_note, auth.uid(), v_doc);

    INSERT INTO stock_wastage (organization_id, doc_number, variant_id, quantity, reason, unit_cost, cost_value, notes)
    VALUES (p_organization_id, v_doc, v_variant, v_qty, v_reason, v_row.pur_price,
            round(v_row.pur_price * v_qty, 2), nullif(btrim(coalesce(v_line ->> 'notes', p_notes)), ''));

    v_total_qty := v_total_qty + v_qty;
    v_total_cost := v_total_cost + round(v_row.pur_price * v_qty, 2);
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'doc_number', v_doc, 'lines', v_count,
                            'total_qty', v_total_qty, 'total_cost', v_total_cost);
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_stock_wastage(p_organization_id uuid, p_doc_number text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row record;
  v_count int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM product_variants
  WHERE organization_id = p_organization_id
    AND id IN (SELECT variant_id FROM stock_wastage
               WHERE organization_id = p_organization_id AND doc_number = p_doc_number AND reversed_at IS NULL)
  ORDER BY id
  FOR UPDATE;

  FOR v_row IN
    SELECT w.id, w.variant_id, w.quantity, w.reason
    FROM stock_wastage w
    WHERE w.organization_id = p_organization_id AND w.doc_number = p_doc_number AND w.reversed_at IS NULL
    FOR UPDATE
  LOOP
    UPDATE product_variants
    SET stock_qty = coalesce(stock_qty, 0) + v_row.quantity,
        opening_qty = coalesce(opening_qty, 0) + v_row.quantity,
        updated_at = now()
    WHERE id = v_row.variant_id AND organization_id = p_organization_id;

    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, notes, user_id, bill_number)
    VALUES (v_row.variant_id, p_organization_id, 'reconciliation', v_row.quantity,
            'Wastage reversed (' || v_row.reason || ') +' || trim_scale(v_row.quantity), auth.uid(), p_doc_number);

    UPDATE stock_wastage SET reversed_at = now(), reversed_by = auth.uid() WHERE id = v_row.id;
    v_count := v_count + 1;
  END LOOP;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'Nothing to reverse for %', p_doc_number USING ERRCODE = 'P0002';
  END IF;
  RETURN jsonb_build_object('success', true, 'lines', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.record_stock_wastage(uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_stock_wastage(uuid, jsonb, text) TO authenticated;
REVOKE ALL ON FUNCTION public.reverse_stock_wastage(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_stock_wastage(uuid, text) TO authenticated;

-- Checks (read-only) after running:
--   SELECT proname, prosecdef FROM pg_proc WHERE proname IN ('record_stock_wastage', 'reverse_stock_wastage');
--   SELECT count(*) FROM public.stock_wastage;   -- 0 on a fresh install
