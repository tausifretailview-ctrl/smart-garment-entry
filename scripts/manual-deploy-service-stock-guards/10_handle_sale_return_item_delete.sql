-- 10. handle_sale_return_item_delete
CREATE OR REPLACE FUNCTION public.handle_sale_return_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_remaining_qty INTEGER := OLD.quantity;
  v_batch RECORD;
  v_deduct_qty INTEGER;
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
  SELECT organization_id INTO v_org_id FROM sale_returns WHERE id = OLD.return_id;

  UPDATE product_variants SET stock_qty = stock_qty - OLD.quantity, updated_at = NOW() WHERE id = OLD.variant_id;

  FOR v_batch IN SELECT id, bill_number, quantity FROM batch_stock WHERE variant_id = OLD.variant_id AND quantity > 0 ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
    UPDATE batch_stock SET quantity = quantity - v_deduct_qty, updated_at = NOW() WHERE id = v_batch.id;

    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'sale_return_delete', -v_deduct_qty, OLD.return_id, v_batch.bill_number, 'Sale return deleted: ' || v_deduct_qty || ' units deducted from batch ' || v_batch.bill_number, v_org_id, auth.uid());

    v_remaining_qty := v_remaining_qty - v_deduct_qty;
  END LOOP;

  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'sale_return_delete', -v_remaining_qty, OLD.return_id, NULL, 'Sale return deleted: ' || v_remaining_qty || ' units deducted from opening stock', v_org_id, auth.uid());
  END IF;

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION 'Error in sale_return_item_delete trigger: %', SQLERRM;
END;
$function$;

