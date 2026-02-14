
CREATE OR REPLACE FUNCTION public.deduct_stock_on_purchase_return()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return_date TIMESTAMPTZ;
  v_remaining_qty INTEGER := NEW.qty;
  v_batch RECORD;
  v_deduct_qty INTEGER;
  v_org_id UUID;
  v_current_stock INTEGER;
BEGIN
  -- Get return date and organization_id
  SELECT return_date, organization_id 
  INTO v_return_date, v_org_id
  FROM purchase_returns
  WHERE id = NEW.return_id;

  -- Check available stock before allowing return
  SELECT stock_qty INTO v_current_stock
  FROM product_variants
  WHERE id = NEW.sku_id;

  IF v_current_stock < NEW.qty THEN
    RAISE EXCEPTION 'No Stock available For Return. Available: %, Requested: %', v_current_stock, NEW.qty;
  END IF;
  
  -- Deduct from batch_stock using FIFO (oldest first)
  FOR v_batch IN 
    SELECT id, bill_number, quantity
    FROM batch_stock
    WHERE variant_id = NEW.sku_id 
      AND quantity > 0
    ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    
    v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
    
    UPDATE batch_stock
    SET quantity = quantity - v_deduct_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;
    
    INSERT INTO stock_movements (
      variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id
    ) VALUES (
      NEW.sku_id, 'purchase_return', -v_deduct_qty, NEW.return_id, v_batch.bill_number,
      'Purchase return: ' || v_deduct_qty || ' units returned from batch ' || v_batch.bill_number, v_org_id
    );
    
    v_remaining_qty := v_remaining_qty - v_deduct_qty;
  END LOOP;
  
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (
      variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id
    ) VALUES (
      NEW.sku_id, 'purchase_return', -v_remaining_qty, NEW.return_id, NULL,
      'Purchase return from opening stock: ' || v_remaining_qty || ' units', v_org_id
    );
  END IF;
  
  UPDATE product_variants
  SET stock_qty = stock_qty - NEW.qty, updated_at = NOW()
  WHERE id = NEW.sku_id;
  
  RETURN NEW;
END;
$function$;
