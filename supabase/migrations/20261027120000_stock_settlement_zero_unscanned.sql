-- Physical count write-off: zero unscanned variants for a settled settlement session.
-- Separate from settle_stock_session (scanned-only). Explicit, confirmed, audited, reversible.
--
-- PREREQ: stock_settlement_scans may be missing on DBs that never applied
-- 20261003170000_stock_settlement_scans.sql — create it first (idempotent).

CREATE TABLE IF NOT EXISTS public.stock_settlement_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  settlement_session_id uuid NOT NULL,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  barcode text,
  counted_qty numeric NOT NULL DEFAULT 0,
  system_qty numeric NOT NULL DEFAULT 0,
  scanned_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  settled boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_settlement_scans_session_variant
  ON public.stock_settlement_scans (settlement_session_id, variant_id);

CREATE INDEX IF NOT EXISTS idx_stock_settlement_scans_org_variant
  ON public.stock_settlement_scans (organization_id, variant_id);

CREATE INDEX IF NOT EXISTS idx_stock_settlement_scans_org_barcode
  ON public.stock_settlement_scans (organization_id, barcode);

CREATE INDEX IF NOT EXISTS idx_stock_settlement_scans_org_session
  ON public.stock_settlement_scans (organization_id, settlement_session_id);

CREATE INDEX IF NOT EXISTS idx_stock_settlement_scans_org_settled
  ON public.stock_settlement_scans (organization_id, settled, scanned_at DESC);

ALTER TABLE public.stock_settlement_scans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view stock settlement scans" ON public.stock_settlement_scans;
DROP POLICY IF EXISTS "Org members can insert stock settlement scans" ON public.stock_settlement_scans;
DROP POLICY IF EXISTS "Org members can update stock settlement scans" ON public.stock_settlement_scans;
DROP POLICY IF EXISTS "Org members can delete stock settlement scans" ON public.stock_settlement_scans;

CREATE POLICY "Org members can view stock settlement scans"
ON public.stock_settlement_scans FOR SELECT
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can insert stock settlement scans"
ON public.stock_settlement_scans FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can update stock settlement scans"
ON public.stock_settlement_scans FOR UPDATE
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can delete stock settlement scans"
ON public.stock_settlement_scans FOR DELETE
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_settlement_scans TO authenticated;

CREATE OR REPLACE FUNCTION public.settle_stock_session(
  p_organization_id uuid,
  p_session_id uuid,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_scan RECORD;
  v_delta numeric;
  v_count integer := 0;
  v_user_id uuid;
  v_note_suffix text;
BEGIN
  PERFORM public.assert_org_member(p_organization_id);
  v_user_id := auth.uid();

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_settlement_scans
    WHERE organization_id = p_organization_id
      AND settlement_session_id = p_session_id
      AND settled = false
  ) THEN
    RAISE EXCEPTION 'No open settlement session found for this organization';
  END IF;

  v_note_suffix := CASE
    WHEN p_note IS NOT NULL AND btrim(p_note) <> '' THEN ' | ' || btrim(p_note)
    ELSE ''
  END;

  FOR v_scan IN
    SELECT *
    FROM public.stock_settlement_scans
    WHERE organization_id = p_organization_id
      AND settlement_session_id = p_session_id
      AND settled = false
    ORDER BY scanned_at ASC
  LOOP
    v_delta := v_scan.counted_qty - v_scan.system_qty;

    UPDATE public.product_variants
    SET stock_qty = GREATEST(0, ROUND(v_scan.counted_qty)::integer),
        updated_at = now()
    WHERE id = v_scan.variant_id
      AND organization_id = p_organization_id;

    IF v_delta <> 0 THEN
      INSERT INTO public.stock_movements (
        variant_id,
        organization_id,
        movement_type,
        quantity,
        reference_id,
        notes,
        user_id
      ) VALUES (
        v_scan.variant_id,
        p_organization_id,
        'reconciliation',
        v_delta,
        p_session_id,
        'Stock settlement: ' || v_scan.system_qty || ' → ' || v_scan.counted_qty
          || ' (adjustment: ' || v_delta || ')' || v_note_suffix,
        v_user_id
      );
    END IF;

    v_count := v_count + 1;
  END LOOP;

  UPDATE public.stock_settlement_scans
  SET settled = true
  WHERE organization_id = p_organization_id
    AND settlement_session_id = p_session_id
    AND settled = false;

  RETURN jsonb_build_object(
    'settled_count', v_count,
    'session_id', p_session_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_stock_session(uuid, uuid, text) TO authenticated;

-- ─── Zero-out write-off (Phase 2) ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.stock_settlement_zero_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  settlement_session_id uuid NOT NULL,
  variant_count integer NOT NULL DEFAULT 0,
  total_units integer NOT NULL DEFAULT 0,
  cost_value numeric NOT NULL DEFAULT 0,
  excluded_variant_ids uuid[] NOT NULL DEFAULT '{}',
  note text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  reversed_at timestamptz,
  reversed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stock_settlement_zero_runs_active
  ON public.stock_settlement_zero_runs (organization_id, settlement_session_id)
  WHERE reversed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_settlement_zero_runs_org_created
  ON public.stock_settlement_zero_runs (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.stock_settlement_zero_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.stock_settlement_zero_runs(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  variant_id uuid NOT NULL REFERENCES public.product_variants(id) ON DELETE CASCADE,
  prior_qty integer NOT NULL,
  pur_price numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, variant_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_settlement_zero_items_org_run
  ON public.stock_settlement_zero_items (organization_id, run_id);

ALTER TABLE public.stock_settlement_zero_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_settlement_zero_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view stock settlement zero runs" ON public.stock_settlement_zero_runs;
CREATE POLICY "Org members can view stock settlement zero runs"
ON public.stock_settlement_zero_runs FOR SELECT
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org members can view stock settlement zero items" ON public.stock_settlement_zero_items;
CREATE POLICY "Org members can view stock settlement zero items"
ON public.stock_settlement_zero_items FOR SELECT
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

GRANT SELECT ON public.stock_settlement_zero_runs TO authenticated;
GRANT SELECT ON public.stock_settlement_zero_items TO authenticated;

-- Candidate set: active non-service variants with stock, no scan row for the session.
CREATE OR REPLACE FUNCTION public._zero_unscanned_candidates(
  p_organization_id uuid,
  p_session_id uuid,
  p_exclude_variant_ids uuid[] DEFAULT '{}'
)
RETURNS TABLE (
  variant_id uuid,
  prior_qty integer,
  pur_price numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    pv.id AS variant_id,
    GREATEST(0, COALESCE(pv.stock_qty, 0))::integer AS prior_qty,
    COALESCE(pv.pur_price, p.default_pur_price, 0)::numeric AS pur_price
  FROM public.product_variants pv
  INNER JOIN public.products p ON p.id = pv.product_id
  WHERE pv.organization_id = p_organization_id
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND pv.active = true
    AND COALESCE(p.product_type, '') <> 'service'
    AND COALESCE(pv.stock_qty, 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.stock_settlement_scans s
      WHERE s.organization_id = p_organization_id
        AND s.settlement_session_id = p_session_id
        AND s.variant_id = pv.id
    )
    AND (
      p_exclude_variant_ids IS NULL
      OR cardinality(p_exclude_variant_ids) = 0
      OR pv.id <> ALL (p_exclude_variant_ids)
    );
$$;

CREATE OR REPLACE FUNCTION public.zero_unscanned_stock_settlement(
  p_organization_id uuid,
  p_session_id uuid,
  p_exclude_variant_ids uuid[] DEFAULT '{}',
  p_confirm_token text DEFAULT NULL,
  p_expected_count integer DEFAULT NULL,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_existing public.stock_settlement_zero_runs%ROWTYPE;
  v_run_id uuid;
  v_count integer := 0;
  v_units integer := 0;
  v_cost numeric := 0;
  v_note_suffix text;
  v_excludes uuid[];
BEGIN
  PERFORM public.assert_org_member(p_organization_id);
  v_user_id := auth.uid();

  IF NOT (
    public.has_org_role(v_user_id, p_organization_id, 'admin'::app_role)
    OR public.has_org_role(v_user_id, p_organization_id, 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only org admin or manager can write off unscanned stock';
  END IF;

  IF p_confirm_token IS NULL OR upper(btrim(p_confirm_token)) <> 'ZERO' THEN
    RAISE EXCEPTION 'Confirmation token must be ZERO';
  END IF;

  IF p_expected_count IS NULL OR p_expected_count < 0 THEN
    RAISE EXCEPTION 'Expected count is required';
  END IF;

  -- Idempotency: active run for this session returns prior result.
  SELECT * INTO v_existing
  FROM public.stock_settlement_zero_runs
  WHERE organization_id = p_organization_id
    AND settlement_session_id = p_session_id
    AND reversed_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'already_applied', true,
      'run_id', v_existing.id,
      'session_id', p_session_id,
      'variant_count', v_existing.variant_count,
      'total_units', v_existing.total_units,
      'cost_value', v_existing.cost_value
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.stock_settlement_scans
    WHERE organization_id = p_organization_id
      AND settlement_session_id = p_session_id
      AND settled = true
  ) THEN
    RAISE EXCEPTION 'Settle scanned items for this session before writing off unscanned stock';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.stock_settlement_scans
    WHERE organization_id = p_organization_id
      AND settlement_session_id = p_session_id
      AND settled = false
  ) THEN
    RAISE EXCEPTION 'Session still has open (unsettled) scans — finish settlement first';
  END IF;

  v_excludes := COALESCE(p_exclude_variant_ids, '{}');

  CREATE TEMP TABLE IF NOT EXISTS tmp_zero_unscanned_candidates (
    variant_id uuid PRIMARY KEY,
    prior_qty integer NOT NULL,
    pur_price numeric NOT NULL
  ) ON COMMIT DROP;
  DELETE FROM tmp_zero_unscanned_candidates;

  INSERT INTO tmp_zero_unscanned_candidates (variant_id, prior_qty, pur_price)
  SELECT c.variant_id, c.prior_qty, c.pur_price
  FROM public._zero_unscanned_candidates(p_organization_id, p_session_id, v_excludes) c;

  SELECT COUNT(*), COALESCE(SUM(c.prior_qty), 0), COALESCE(SUM(c.prior_qty * c.pur_price), 0)
  INTO v_count, v_units, v_cost
  FROM tmp_zero_unscanned_candidates c;

  IF v_count <> p_expected_count THEN
    RAISE EXCEPTION 'Expected count mismatch: client %, server % — refresh the list and try again',
      p_expected_count, v_count;
  END IF;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'No unscanned stock to write off for this session';
  END IF;

  v_note_suffix := CASE
    WHEN p_note IS NOT NULL AND btrim(p_note) <> '' THEN ' | ' || btrim(p_note)
    ELSE ''
  END;

  INSERT INTO public.stock_settlement_zero_runs (
    organization_id,
    settlement_session_id,
    variant_count,
    total_units,
    cost_value,
    excluded_variant_ids,
    note,
    created_by
  ) VALUES (
    p_organization_id,
    p_session_id,
    v_count,
    v_units,
    round(v_cost::numeric, 2),
    v_excludes,
    NULLIF(btrim(COALESCE(p_note, '')), ''),
    v_user_id
  )
  RETURNING id INTO v_run_id;

  INSERT INTO public.stock_settlement_zero_items (
    run_id, organization_id, variant_id, prior_qty, pur_price
  )
  SELECT v_run_id, p_organization_id, c.variant_id, c.prior_qty, c.pur_price
  FROM tmp_zero_unscanned_candidates c;

  UPDATE public.product_variants pv
  SET stock_qty = 0,
      updated_at = now()
  FROM tmp_zero_unscanned_candidates c
  WHERE pv.id = c.variant_id
    AND pv.organization_id = p_organization_id;

  INSERT INTO public.stock_movements (
    variant_id,
    organization_id,
    movement_type,
    quantity,
    reference_id,
    notes,
    user_id
  )
  SELECT
    c.variant_id,
    p_organization_id,
    'reconciliation',
    -c.prior_qty,
    p_session_id,
    'Physical Count — not found: ' || c.prior_qty || ' → 0 (session '
      || left(p_session_id::text, 8) || ')' || v_note_suffix,
    v_user_id
  FROM tmp_zero_unscanned_candidates c
  WHERE c.prior_qty <> 0;

  RETURN jsonb_build_object(
    'already_applied', false,
    'run_id', v_run_id,
    'session_id', p_session_id,
    'variant_count', v_count,
    'total_units', v_units,
    'cost_value', round(v_cost::numeric, 2)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_unscanned_stock_settlement(
  p_organization_id uuid,
  p_run_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_run public.stock_settlement_zero_runs%ROWTYPE;
  v_restored integer := 0;
BEGIN
  PERFORM public.assert_org_member(p_organization_id);
  v_user_id := auth.uid();

  IF NOT (
    public.has_org_role(v_user_id, p_organization_id, 'admin'::app_role)
    OR public.has_org_role(v_user_id, p_organization_id, 'manager'::app_role)
  ) THEN
    RAISE EXCEPTION 'Only org admin or manager can reverse unscanned write-off';
  END IF;

  SELECT * INTO v_run
  FROM public.stock_settlement_zero_runs
  WHERE id = p_run_id
    AND organization_id = p_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Write-off run not found';
  END IF;

  IF v_run.reversed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'already_reversed', true,
      'run_id', v_run.id,
      'session_id', v_run.settlement_session_id,
      'restored_count', 0
    );
  END IF;

  UPDATE public.product_variants pv
  SET stock_qty = GREATEST(0, zi.prior_qty),
      updated_at = now()
  FROM public.stock_settlement_zero_items zi
  WHERE zi.run_id = v_run.id
    AND zi.organization_id = p_organization_id
    AND pv.id = zi.variant_id
    AND pv.organization_id = p_organization_id;

  GET DIAGNOSTICS v_restored = ROW_COUNT;

  INSERT INTO public.stock_movements (
    variant_id,
    organization_id,
    movement_type,
    quantity,
    reference_id,
    notes,
    user_id
  )
  SELECT
    zi.variant_id,
    p_organization_id,
    'reconciliation',
    zi.prior_qty,
    v_run.settlement_session_id,
    'Reversal: Physical Count — not found: restored ' || zi.prior_qty
      || ' (session ' || left(v_run.settlement_session_id::text, 8) || ')',
    v_user_id
  FROM public.stock_settlement_zero_items zi
  WHERE zi.run_id = v_run.id
    AND zi.organization_id = p_organization_id
    AND zi.prior_qty <> 0;

  UPDATE public.stock_settlement_zero_runs
  SET reversed_at = now(),
      reversed_by = v_user_id
  WHERE id = v_run.id
    AND organization_id = p_organization_id
    AND reversed_at IS NULL;

  RETURN jsonb_build_object(
    'already_reversed', false,
    'run_id', v_run.id,
    'session_id', v_run.settlement_session_id,
    'restored_count', v_restored,
    'total_units', v_run.total_units,
    'cost_value', v_run.cost_value
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public._zero_unscanned_candidates(uuid, uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.zero_unscanned_stock_settlement(uuid, uuid, uuid[], text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_unscanned_stock_settlement(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.zero_unscanned_stock_settlement(uuid, uuid, uuid[], text, integer, text) IS
  'Set stock_qty=0 for unscanned (no scan row) active non-service variants after a settled physical count session. Admin/manager only. Idempotent per session until reversed.';

COMMENT ON FUNCTION public.reverse_unscanned_stock_settlement(uuid, uuid) IS
  'Restore prior_qty from stock_settlement_zero_items for a write-off run and mark the run reversed.';
