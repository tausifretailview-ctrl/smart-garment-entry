-- Fix update_stock_on_sale trigger to handle missing batch stock
CREATE OR REPLACE FUNCTION public.update_stock_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining_qty INTEGER := NEW.quantity;
  v_batch RECORD;
  v_deduct_qty INTEGER;
  v_bills_used TEXT := '';
  v_current_stock INTEGER;
BEGIN
  -- Check total available stock in product_variants
  SELECT stock_qty INTO v_current_stock
  FROM product_variants
  WHERE id = NEW.variant_id;
  
  -- If insufficient stock in product_variants, raise error
  IF v_current_stock < NEW.quantity THEN
    RAISE EXCEPTION 'Insufficient stock: needed %, available %', NEW.quantity, v_current_stock;
  END IF;
  
  -- FIFO: Get batches ordered by purchase date (oldest first)
  FOR v_batch IN 
    SELECT bill_number, quantity, id
    FROM batch_stock
    WHERE variant_id = NEW.variant_id 
      AND quantity > 0
    ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    
    -- Calculate how much to deduct from this batch
    v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
    
    -- Update batch stock
    UPDATE batch_stock
    SET quantity = quantity - v_deduct_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;
    
    -- Track which bills were used
    v_bills_used := v_bills_used || v_batch.bill_number || '(' || v_deduct_qty || '), ';
    
    -- Record stock movement for this batch
    INSERT INTO stock_movements (
      variant_id,
      movement_type,
      quantity,
      reference_id,
      bill_number,
      notes
    ) VALUES (
      NEW.variant_id,
      'sale',
      -v_deduct_qty,
      NEW.sale_id,
      v_batch.bill_number,
      'FIFO deduction: ' || v_deduct_qty || ' units from bill ' || v_batch.bill_number
    );
    
    v_remaining_qty := v_remaining_qty - v_deduct_qty;
  END LOOP;
  
  -- If remaining quantity after batch deduction, record as opening stock usage
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (
      variant_id,
      movement_type,
      quantity,
      reference_id,
      bill_number,
      notes
    ) VALUES (
      NEW.variant_id,
      'sale',
      -v_remaining_qty,
      NEW.sale_id,
      NULL,
      'Sale from opening stock: ' || v_remaining_qty || ' units'
    );
  END IF;
  
  -- Update total stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty - NEW.quantity,
      updated_at = NOW()
  WHERE id = NEW.variant_id;
  
  RETURN NEW;
END;
$function$;