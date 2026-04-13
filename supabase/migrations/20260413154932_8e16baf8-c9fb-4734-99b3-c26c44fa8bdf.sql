
CREATE OR REPLACE FUNCTION public.reconcile_variant_stock_qty(p_variant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_opening numeric;
  v_batch numeric;
  v_current numeric;
  v_calculated numeric;
BEGIN
  -- Get current values
  SELECT organization_id, COALESCE(opening_qty, 0), COALESCE(stock_qty, 0)
  INTO v_org_id, v_opening, v_current
  FROM product_variants
  WHERE id = p_variant_id;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Variant not found');
  END IF;

  -- Sum batch_stock (purchase-driven stock)
  SELECT COALESCE(SUM(quantity), 0) INTO v_batch
  FROM batch_stock
  WHERE variant_id = p_variant_id AND organization_id = v_org_id;

  v_calculated := v_opening + v_batch;

  IF v_calculated != v_current THEN
    UPDATE product_variants SET stock_qty = v_calculated, updated_at = now()
    WHERE id = p_variant_id;

    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, notes)
    VALUES (p_variant_id, v_org_id, 'reconciliation', v_calculated - v_current, p_variant_id,
      'Auto-reconciliation: corrected from ' || v_current || ' to ' || v_calculated);
  END IF;

  RETURN jsonb_build_object(
    'variant_id', p_variant_id,
    'old_stock', v_current,
    'new_stock', v_calculated,
    'corrected', v_calculated != v_current
  );
END;
$$;
