-- Stock Settlement: keep stock, opening qty and movements in step.
--
-- Bugs fixed (settle_stock_session, zero_unscanned_stock_settlement,
-- reverse_unscanned_stock_settlement):
-- 1. Settlement changed stock_qty but not opening_qty. Stock Reconciliation
--    (opening + bills) ignores 'reconciliation' movements, so every settled
--    difference showed as drift and its Fix undid the settlement. Opening now
--    moves by the same qty, like the Stock Adjustment tool (PR #1329).
-- 2. Matched rows (incl. Auto-Match All) were set to the qty loaded when the
--    page opened. A sale/purchase after that was silently overwritten with no
--    movement. Matched rows now leave stock alone.
-- 3. Movement qty was counted - system_qty (page-load qty), not the real
--    change. It is now new stock - current stock (row locked).
-- 4. Write-off reversal set stock back to the old qty, dropping any purchase
--    made after the write-off. It now adds the written-off qty back.
-- Movement notes start with "Stock Settlement" so reports tag them as such.

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
  v_current integer;
  v_new integer;
  v_delta integer;
  v_count integer := 0;
  v_changed integer := 0;
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
    v_count := v_count + 1;

    -- Match (counted = software qty at scan time): nothing to settle. Leave the
    -- live qty alone so later sales/purchases are not overwritten.
    IF v_scan.counted_qty = v_scan.system_qty THEN
      CONTINUE;
    END IF;

    SELECT COALESCE(pv.stock_qty, 0)::integer INTO v_current
    FROM public.product_variants pv
    WHERE pv.id = v_scan.variant_id
      AND pv.organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    v_new := GREATEST(0, ROUND(v_scan.counted_qty)::integer);
    v_delta := v_new - v_current;

    IF v_delta = 0 THEN
      CONTINUE;
    END IF;

    -- Opening moves with stock so Stock Reconciliation (opening + bills) still matches.
    UPDATE public.product_variants
    SET stock_qty = v_new,
        opening_qty = COALESCE(opening_qty, 0) + v_delta,
        updated_at = now()
    WHERE id = v_scan.variant_id
      AND organization_id = p_organization_id;

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
      'Stock Settlement: ' || v_current || ' → ' || v_new
        || ' (counted ' || v_scan.counted_qty || ', software ' || v_scan.system_qty || ')'
        || v_note_suffix,
      v_user_id
    );

    v_changed := v_changed + 1;
  END LOOP;

  UPDATE public.stock_settlement_scans
  SET settled = true
  WHERE organization_id = p_organization_id
    AND settlement_session_id = p_session_id
    AND settled = false;

  RETURN jsonb_build_object(
    'settled_count', v_count,
    'changed_count', v_changed,
    'session_id', p_session_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.settle_stock_session(uuid, uuid, text) TO authenticated;

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

  -- Opening moves with stock so Stock Reconciliation (opening + bills) still matches.
  UPDATE public.product_variants pv
  SET stock_qty = 0,
      opening_qty = COALESCE(pv.opening_qty, 0) - c.prior_qty,
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
    'Stock Settlement write off (not found): ' || c.prior_qty || ' → 0 (session '
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

  -- Add the written-off qty back (not reset to it) so purchases made after the
  -- write-off are kept; opening moves with it.
  UPDATE public.product_variants pv
  SET stock_qty = COALESCE(pv.stock_qty, 0) + GREATEST(0, zi.prior_qty),
      opening_qty = COALESCE(pv.opening_qty, 0) + GREATEST(0, zi.prior_qty),
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
    'Stock Settlement write off reversed: restored ' || zi.prior_qty
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

GRANT EXECUTE ON FUNCTION public.zero_unscanned_stock_settlement(uuid, uuid, uuid[], text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_unscanned_stock_settlement(uuid, uuid) TO authenticated;
