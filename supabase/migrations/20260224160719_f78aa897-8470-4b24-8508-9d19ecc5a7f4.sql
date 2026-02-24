
-- Function to merge duplicate suppliers
CREATE OR REPLACE FUNCTION public.merge_suppliers(
  p_target_supplier_id uuid,
  p_source_supplier_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_target RECORD;
  v_source RECORD;
  v_org_id UUID;
  v_purchases_moved INTEGER := 0;
  v_orders_moved INTEGER := 0;
  v_returns_moved INTEGER := 0;
BEGIN
  -- Validate both suppliers exist
  SELECT * INTO v_target FROM suppliers WHERE id = p_target_supplier_id AND deleted_at IS NULL;
  SELECT * INTO v_source FROM suppliers WHERE id = p_source_supplier_id AND deleted_at IS NULL;

  IF v_target IS NULL THEN RAISE EXCEPTION 'Target supplier not found or deleted.'; END IF;
  IF v_source IS NULL THEN RAISE EXCEPTION 'Source supplier not found or deleted.'; END IF;
  IF v_target.organization_id != v_source.organization_id THEN
    RAISE EXCEPTION 'Suppliers must belong to the same organization.';
  END IF;

  v_org_id := v_target.organization_id;

  -- Move purchase bills
  UPDATE purchase_bills
  SET supplier_id = p_target_supplier_id,
      supplier_name = v_target.supplier_name
  WHERE supplier_id = p_source_supplier_id;
  GET DIAGNOSTICS v_purchases_moved = ROW_COUNT;

  -- Move purchase orders
  UPDATE purchase_orders
  SET supplier_id = p_target_supplier_id,
      supplier_name = v_target.supplier_name
  WHERE supplier_id = p_source_supplier_id;
  GET DIAGNOSTICS v_orders_moved = ROW_COUNT;

  -- Move purchase returns
  UPDATE purchase_returns
  SET supplier_id = p_target_supplier_id,
      supplier_name = v_target.supplier_name
  WHERE supplier_id = p_source_supplier_id;
  GET DIAGNOSTICS v_returns_moved = ROW_COUNT;

  -- Consolidate opening balance into target
  UPDATE suppliers
  SET opening_balance = COALESCE(v_target.opening_balance, 0) + COALESCE(v_source.opening_balance, 0)
  WHERE id = p_target_supplier_id;

  -- Soft-delete source supplier
  UPDATE suppliers
  SET deleted_at = NOW()
  WHERE id = p_source_supplier_id;

  -- Audit log
  INSERT INTO audit_logs (organization_id, entity_type, entity_id, action, old_values, new_values)
  VALUES (
    v_org_id,
    'supplier',
    p_target_supplier_id,
    'SUPPLIER_MERGED',
    jsonb_build_object('source_supplier_id', p_source_supplier_id, 'source_name', v_source.supplier_name),
    jsonb_build_object('purchases_moved', v_purchases_moved, 'orders_moved', v_orders_moved, 'returns_moved', v_returns_moved, 'target_name', v_target.supplier_name)
  );

  RETURN json_build_object(
    'purchases_moved', v_purchases_moved,
    'orders_moved', v_orders_moved,
    'returns_moved', v_returns_moved
  );
END;
$$;
