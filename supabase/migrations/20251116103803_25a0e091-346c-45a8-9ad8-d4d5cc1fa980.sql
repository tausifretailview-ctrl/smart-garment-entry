-- Fix security warnings: Set search_path on trigger functions
DROP TRIGGER IF EXISTS on_purchase_item_insert ON purchase_items;
DROP TRIGGER IF EXISTS on_sale_item_insert ON sale_items;
DROP FUNCTION IF EXISTS update_stock_on_purchase();
DROP FUNCTION IF EXISTS update_stock_on_sale();

CREATE OR REPLACE FUNCTION update_stock_on_purchase()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase_date TIMESTAMPTZ;
  v_bill_number TEXT;
BEGIN
  -- Get purchase bill date and software_bill_no
  SELECT bill_date, software_bill_no 
  INTO v_purchase_date, v_bill_number
  FROM purchase_bills
  WHERE id = NEW.bill_id;
  
  -- Update total stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty + NEW.qty,
      updated_at = NOW()
  WHERE id = NEW.sku_id;
  
  -- Create or update batch_stock record
  INSERT INTO batch_stock (variant_id, bill_number, quantity, purchase_bill_id, purchase_date)
  VALUES (NEW.sku_id, v_bill_number, NEW.qty, NEW.bill_id, v_purchase_date)
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET 
    quantity = batch_stock.quantity + EXCLUDED.quantity,
    updated_at = NOW();
  
  -- Insert stock movement record
  INSERT INTO stock_movements (
    variant_id,
    movement_type,
    quantity,
    reference_id,
    bill_number,
    notes
  ) VALUES (
    NEW.sku_id,
    'purchase',
    NEW.qty,
    NEW.bill_id,
    v_bill_number,
    'Stock added from purchase bill ' || v_bill_number
  );
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_purchase_item_insert
  AFTER INSERT ON purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION update_stock_on_purchase();

CREATE OR REPLACE FUNCTION update_stock_on_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining_qty INTEGER := NEW.quantity;
  v_batch RECORD;
  v_deduct_qty INTEGER;
  v_bills_used TEXT := '';
BEGIN
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
  
  -- Update total stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty - NEW.quantity,
      updated_at = NOW()
  WHERE id = NEW.variant_id;
  
  -- If remaining quantity > 0, insufficient stock
  IF v_remaining_qty > 0 THEN
    RAISE EXCEPTION 'Insufficient stock: needed %, available in batches', NEW.quantity;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_sale_item_insert
  AFTER INSERT ON sale_items
  FOR EACH ROW
  EXECUTE FUNCTION update_stock_on_sale();