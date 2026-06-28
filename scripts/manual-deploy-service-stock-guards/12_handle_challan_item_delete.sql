-- 12. handle_challan_item_delete
CREATE OR REPLACE FUNCTION public.handle_challan_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_remaining_qty INTEGER := OLD.quantity;
  v_batch RECORD;
  v_restore_qty INTEGER;
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = OLD.variant_id
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN OLD;
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN RETURN OLD; END IF;
  SELECT organization_id INTO v_org_id FROM delivery_challans WHERE id = OLD.challan_id;

  UPDATE product_variants SET stock_qty = stock_qty + OLD.quantity, updated_at = NOW() WHERE id = OLD.variant_id;

  FOR v_batch IN SELECT bill_number, id FROM batch_stock WHERE variant_id = OLD.variant_id ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_restore_qty := LEAST(v_remaining_qty, OLD.quantity);
    UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = NOW() WHERE id = v_batch.id;

    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'challan_delete', v_restore_qty, OLD.challan_id, v_batch.bill_number, 'Challan deleted: ' || v_restore_qty || ' restored to batch ' || v_batch.bill_number, v_org_id, auth.uid());

    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;

  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'challan_delete', v_remaining_qty, OLD.challan_id, 'Challan deleted: restored to opening stock', v_org_id, auth.uid());
  END IF;

  RETURN OLD;
END;
$function$;

