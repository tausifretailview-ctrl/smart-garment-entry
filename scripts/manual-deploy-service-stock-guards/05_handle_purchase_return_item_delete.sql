-- 5. handle_purchase_return_item_delete
CREATE OR REPLACE FUNCTION public.handle_purchase_return_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_batch RECORD;
  v_remaining_qty INTEGER := OLD.qty;
  v_restore_qty INTEGER;
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = OLD.sku_id
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN OLD;
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN RETURN OLD; END IF;

  SELECT organization_id INTO v_org_id FROM purchase_returns WHERE id = OLD.return_id;

  UPDATE product_variants
  SET stock_qty = stock_qty + OLD.qty, updated_at = NOW()
  WHERE id = OLD.sku_id;

  FOR v_batch IN
    SELECT bs.id, bs.bill_number, bs.quantity,
           COALESCE((
             SELECT SUM(ABS(sm.quantity))
             FROM stock_movements sm
             WHERE sm.variant_id = OLD.sku_id
               AND sm.bill_number = bs.bill_number
               AND sm.movement_type = 'purchase_return'
               AND sm.reference_id = OLD.return_id
           ), 0) as previously_deducted
    FROM batch_stock bs
    WHERE bs.variant_id = OLD.sku_id
    ORDER BY bs.purchase_date DESC, bs.created_at DESC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;

    v_restore_qty := LEAST(v_remaining_qty, v_batch.previously_deducted);

    IF v_restore_qty > 0 THEN
      UPDATE batch_stock
      SET quantity = quantity + v_restore_qty, updated_at = NOW()
      WHERE id = v_batch.id;

      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
      VALUES (OLD.sku_id, 'purchase_return_delete', v_restore_qty, OLD.return_id, v_batch.bill_number,
        'Purchase return deleted: ' || v_restore_qty || ' units restored to batch ' || v_batch.bill_number,
        v_org_id, auth.uid());

      v_remaining_qty := v_remaining_qty - v_restore_qty;
    END IF;
  END LOOP;

  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.sku_id, 'purchase_return_delete', v_remaining_qty, OLD.return_id, NULL,
      'Purchase return deleted: ' || v_remaining_qty || ' units (original batch no longer available)',
      v_org_id, auth.uid());
  END IF;

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in purchase_return_item_delete trigger: %', SQLERRM;
END;
$$;

