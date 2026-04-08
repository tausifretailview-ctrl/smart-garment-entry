CREATE OR REPLACE FUNCTION public.restore_stock_on_sale_return()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_remaining_qty INTEGER := NEW.quantity;
  v_batch RECORD;
  v_restore_qty INTEGER;
  v_return_date DATE;
  v_org_id UUID;
  v_total_sold INTEGER;
  v_already_returned INTEGER;
BEGIN
  SELECT return_date, organization_id INTO v_return_date, v_org_id
  FROM sale_returns WHERE id = NEW.return_id;

  -- VALIDATION: Check total sold vs already returned for this variant
  SELECT COALESCE(SUM(quantity), 0) INTO v_total_sold
  FROM sale_items
  WHERE variant_id = NEW.variant_id AND deleted_at IS NULL;

  SELECT COALESCE(SUM(quantity), 0) INTO v_already_returned
  FROM sale_return_items
  WHERE variant_id = NEW.variant_id AND deleted_at IS NULL
  AND id != NEW.id;

  IF (v_already_returned + NEW.quantity) > v_total_sold THEN
    RAISE EXCEPTION 'Cannot return % units — only % sold, % already returned',
      NEW.quantity, v_total_sold, v_already_returned;
  END IF;

  -- Original stock restore logic
  UPDATE product_variants SET stock_qty = stock_qty + NEW.quantity, updated_at = NOW() WHERE id = NEW.variant_id;

  FOR v_batch IN SELECT id, bill_number, quantity FROM batch_stock WHERE variant_id = NEW.variant_id ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_restore_qty := LEAST(v_remaining_qty, v_batch.quantity);
    UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = NOW() WHERE id = v_batch.id;
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'sale_return', v_restore_qty, NEW.return_id, v_batch.bill_number,
      'Sale return: ' || v_restore_qty || ' units restored to batch ' || v_batch.bill_number, v_org_id, auth.uid());
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;

  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'sale_return', v_remaining_qty, NEW.return_id, NULL,
      'Sale return to opening stock: ' || v_remaining_qty || ' units', v_org_id, auth.uid());
  END IF;

  RETURN NEW;
END; $$;