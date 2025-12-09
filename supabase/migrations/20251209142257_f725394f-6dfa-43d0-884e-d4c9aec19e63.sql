-- Update the trigger function to skip stock validation for service and combo products
CREATE OR REPLACE FUNCTION update_stock_on_sale()
RETURNS TRIGGER AS $$
DECLARE
  v_remaining_qty INTEGER := NEW.quantity;
  v_batch RECORD;
  v_deduct_qty INTEGER;
  v_bills_used TEXT := '';
  v_current_stock INTEGER;
  v_org_id UUID;
  v_product_type TEXT;
BEGIN
  -- Get organization_id from the sale
  SELECT organization_id INTO v_org_id
  FROM sales
  WHERE id = NEW.sale_id;
  
  -- Get product type to check if it's a service or combo
  SELECT p.product_type INTO v_product_type
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.id = NEW.variant_id;
  
  -- Skip stock validation and deduction for service and combo products
  IF v_product_type = 'service' OR v_product_type = 'combo' THEN
    -- Just record a stock movement for tracking purposes without modifying stock
    INSERT INTO stock_movements (
      variant_id,
      movement_type,
      quantity,
      reference_id,
      bill_number,
      notes,
      organization_id
    ) VALUES (
      NEW.variant_id,
      'sale',
      -NEW.quantity,
      NEW.sale_id,
      NULL,
      'Service/Combo sale: ' || NEW.quantity || ' units (no stock tracking)',
      v_org_id
    );
    RETURN NEW;
  END IF;
  
  -- Check total available stock in product_variants (only for goods)
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
    
    -- Record stock movement for this batch with organization_id
    INSERT INTO stock_movements (
      variant_id,
      movement_type,
      quantity,
      reference_id,
      bill_number,
      notes,
      organization_id
    ) VALUES (
      NEW.variant_id,
      'sale',
      -v_deduct_qty,
      NEW.sale_id,
      v_batch.bill_number,
      'FIFO deduction: ' || v_deduct_qty || ' units from bill ' || v_batch.bill_number,
      v_org_id
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
      notes,
      organization_id
    ) VALUES (
      NEW.variant_id,
      'sale',
      -v_remaining_qty,
      NEW.sale_id,
      NULL,
      'Sale from opening stock: ' || v_remaining_qty || ' units',
      v_org_id
    );
  END IF;
  
  -- Update total stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty - NEW.quantity,
      updated_at = NOW()
  WHERE id = NEW.variant_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;