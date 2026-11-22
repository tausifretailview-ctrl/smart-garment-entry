-- Review item D6 (22 Nov 2026): stock adjustment no longer overwrites sales made meanwhile.
--
-- Stock Adjustment wrote stock_qty = (the figure the screen had loaded) + (the user's change).
-- If a bill was saved while the screen was open, that write put the stock back to the old
-- figure plus the change: the sale's stock reduction was lost. The movement row was a second
-- request and could be missing.
--
-- adjust_variant_stock(org, variant, delta, set_to, notes, bill_number), exactly one of
-- p_delta / p_set_to:
--   * p_delta  -> stock_qty = stock_qty + delta, opening_qty = opening_qty + delta, on the
--                 row as it is in the database NOW (Stock Adjustment: opening moves with stock).
--   * p_set_to -> stock_qty = set_to, opening_qty = set_to (the closing-stock Excel import,
--                 unchanged meaning); the movement records the real difference.
--   * one stock_movements row ('reconciliation') with the real change, in the same transaction.
--   * returns the figures before and after.
-- SECURITY INVOKER: same RLS and the same triggers (negative-stock guard, audit, current_stock
-- sync) as the direct writes it replaces. The app falls back to the old writes (reading the
-- current stock first) while this script has not been run.
-- UNDO: DROP FUNCTION public.adjust_variant_stock(uuid, uuid, numeric, numeric, text, text);

CREATE OR REPLACE FUNCTION public.adjust_variant_stock(
  p_organization_id uuid,
  p_variant_id uuid,
  p_delta numeric DEFAULT NULL,
  p_set_to numeric DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_bill_number text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_stock_before numeric;
  v_opening_before numeric;
  v_stock_after numeric;
  v_opening_after numeric;
  v_change numeric;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF p_variant_id IS NULL THEN
    RAISE EXCEPTION 'variant id is required' USING ERRCODE = '22023';
  END IF;
  IF (p_delta IS NULL) = (p_set_to IS NULL) THEN
    RAISE EXCEPTION 'Give either a change (p_delta) or a new stock figure (p_set_to)' USING ERRCODE = '22023';
  END IF;

  -- Lock the row: a bill being saved for the same item waits, and this reads the stock it left.
  SELECT COALESCE(stock_qty, 0), COALESCE(opening_qty, 0)
  INTO v_stock_before, v_opening_before
  FROM public.product_variants
  WHERE id = p_variant_id AND organization_id = p_organization_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found' USING ERRCODE = 'P0002';
  END IF;

  IF p_delta IS NOT NULL THEN
    v_stock_after := v_stock_before + p_delta;
    v_opening_after := v_opening_before + p_delta;
  ELSE
    v_stock_after := p_set_to;
    v_opening_after := p_set_to;
  END IF;
  v_change := v_stock_after - v_stock_before;

  UPDATE public.product_variants
  SET stock_qty = v_stock_after,
      opening_qty = v_opening_after,
      updated_at = now()
  WHERE id = p_variant_id AND organization_id = p_organization_id;

  IF v_change <> 0 THEN
    INSERT INTO public.stock_movements
      (variant_id, organization_id, movement_type, quantity, notes, user_id, bill_number)
    VALUES (
      p_variant_id,
      p_organization_id,
      'reconciliation',
      v_change,
      COALESCE(NULLIF(btrim(p_notes), ''), 'Stock Adjustment')
        || ': stock ' || trim_scale(v_stock_before) || ' → ' || trim_scale(v_stock_after)
        || ', opening ' || trim_scale(v_opening_before) || ' → ' || trim_scale(v_opening_after),
      auth.uid(),
      NULLIF(btrim(p_bill_number), '')
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'stock_before', v_stock_before,
    'stock_after', v_stock_after,
    'opening_before', v_opening_before,
    'opening_after', v_opening_after,
    'change', v_change
  );
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_variant_stock(uuid, uuid, numeric, numeric, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_variant_stock(uuid, uuid, numeric, numeric, text, text) TO authenticated;

COMMENT ON FUNCTION public.adjust_variant_stock(uuid, uuid, numeric, numeric, text, text) IS
  'Stock Adjustment / closing-stock import: changes stock and opening on the current row and logs the movement, in one transaction (review item D6).';
