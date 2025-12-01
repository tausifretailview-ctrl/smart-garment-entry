-- Update trigger function: update_stock_on_purchase
CREATE OR REPLACE FUNCTION public.update_stock_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase_date TIMESTAMPTZ;
  v_bill_number TEXT;
  v_org_id UUID;
BEGIN
  -- Get purchase bill date, software_bill_no, and organization_id
  SELECT bill_date, software_bill_no, organization_id 
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM purchase_bills
  WHERE id = NEW.bill_id;
  
  -- Update total stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty + NEW.qty,
      updated_at = NOW()
  WHERE id = NEW.sku_id;
  
  -- Create or update batch_stock record with organization_id
  INSERT INTO batch_stock (variant_id, bill_number, quantity, purchase_bill_id, purchase_date, organization_id)
  VALUES (NEW.sku_id, v_bill_number, NEW.qty, NEW.bill_id, v_purchase_date, v_org_id)
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET 
    quantity = batch_stock.quantity + EXCLUDED.quantity,
    updated_at = NOW();
  
  -- Insert stock movement record with organization_id
  INSERT INTO stock_movements (
    variant_id,
    movement_type,
    quantity,
    reference_id,
    bill_number,
    notes,
    organization_id
  ) VALUES (
    NEW.sku_id,
    'purchase',
    NEW.qty,
    NEW.bill_id,
    v_bill_number,
    'Stock added from purchase bill ' || v_bill_number,
    v_org_id
  );
  
  RETURN NEW;
END;
$$;

-- Update trigger function: update_stock_on_sale
CREATE OR REPLACE FUNCTION public.update_stock_on_sale()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining_qty INTEGER := NEW.quantity;
  v_batch RECORD;
  v_deduct_qty INTEGER;
  v_bills_used TEXT := '';
  v_current_stock INTEGER;
  v_org_id UUID;
BEGIN
  -- Get organization_id from the sale
  SELECT organization_id INTO v_org_id
  FROM sales
  WHERE id = NEW.sale_id;
  
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
$$;

-- Update trigger function: handle_purchase_item_update
CREATE OR REPLACE FUNCTION public.handle_purchase_item_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qty_difference INTEGER;
  v_purchase_date TIMESTAMPTZ;
  v_bill_number TEXT;
  v_org_id UUID;
BEGIN
  -- Only process if quantity changed
  IF OLD.qty = NEW.qty THEN
    RETURN NEW;
  END IF;
  
  -- Calculate difference
  v_qty_difference := NEW.qty - OLD.qty;
  
  -- Get purchase bill details and organization_id
  SELECT pb.bill_date, pb.software_bill_no, pb.organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM purchase_bills pb
  WHERE pb.id = NEW.bill_id;
  
  -- Validate organization isolation
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID not found for purchase bill';
  END IF;
  
  -- Update stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty + v_qty_difference,
      updated_at = NOW()
  WHERE id = NEW.sku_id;
  
  -- Update batch_stock
  UPDATE batch_stock
  SET quantity = quantity + v_qty_difference,
      updated_at = NOW()
  WHERE variant_id = NEW.sku_id 
    AND bill_number = v_bill_number;
  
  -- Create audit trail in stock_movements with organization_id
  INSERT INTO stock_movements (
    variant_id,
    movement_type,
    quantity,
    reference_id,
    bill_number,
    notes,
    organization_id
  ) VALUES (
    NEW.sku_id,
    CASE 
      WHEN v_qty_difference > 0 THEN 'purchase_increase'
      ELSE 'purchase_decrease'
    END,
    v_qty_difference,
    NEW.bill_id,
    v_bill_number,
    'Stock adjusted: Purchase quantity changed from ' || OLD.qty || ' to ' || NEW.qty || ' in bill ' || v_bill_number,
    v_org_id
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in purchase_item_update trigger: %', SQLERRM;
END;
$$;

-- Update trigger function: handle_purchase_item_delete
CREATE OR REPLACE FUNCTION public.handle_purchase_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_purchase_date TIMESTAMPTZ;
  v_bill_number TEXT;
  v_org_id UUID;
BEGIN
  -- Get purchase bill details and organization_id
  SELECT pb.bill_date, pb.software_bill_no, pb.organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM purchase_bills pb
  WHERE pb.id = OLD.bill_id;
  
  -- Validate organization isolation
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID not found for purchase bill';
  END IF;
  
  -- Decrease stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty - OLD.qty,
      updated_at = NOW()
  WHERE id = OLD.sku_id;
  
  -- Decrease or remove batch_stock
  UPDATE batch_stock
  SET quantity = quantity - OLD.qty,
      updated_at = NOW()
  WHERE variant_id = OLD.sku_id 
    AND bill_number = v_bill_number;
  
  -- Delete batch_stock record if quantity becomes zero
  DELETE FROM batch_stock
  WHERE variant_id = OLD.sku_id 
    AND bill_number = v_bill_number
    AND quantity <= 0;
  
  -- Create audit trail in stock_movements with organization_id
  INSERT INTO stock_movements (
    variant_id,
    movement_type,
    quantity,
    reference_id,
    bill_number,
    notes,
    organization_id
  ) VALUES (
    OLD.sku_id,
    'purchase_delete',
    -OLD.qty,
    OLD.bill_id,
    v_bill_number,
    'Stock decreased: Purchase item deleted from bill ' || v_bill_number,
    v_org_id
  );
  
  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in purchase_item_delete trigger: %', SQLERRM;
END;
$$;

-- Update trigger function: handle_sale_item_delete
CREATE OR REPLACE FUNCTION public.handle_sale_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale_date TIMESTAMPTZ;
  v_sale_number TEXT;
  v_org_id UUID;
  v_remaining_qty INTEGER := OLD.quantity;
  v_batch RECORD;
  v_restore_qty INTEGER;
BEGIN
  -- Get sale details and organization_id
  SELECT s.sale_date, s.sale_number, s.organization_id
  INTO v_sale_date, v_sale_number, v_org_id
  FROM sales s
  WHERE s.id = OLD.sale_id;
  
  -- Validate organization isolation
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID not found for sale';
  END IF;
  
  -- Restore stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty + OLD.quantity,
      updated_at = NOW()
  WHERE id = OLD.variant_id;
  
  -- Restore batch_stock using FIFO reversal (restore to oldest batches first)
  FOR v_batch IN 
    SELECT bill_number, quantity, id
    FROM batch_stock
    WHERE variant_id = OLD.variant_id
    ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    
    -- Calculate how much to restore to this batch
    v_restore_qty := LEAST(v_remaining_qty, OLD.quantity);
    
    -- Restore to this batch
    UPDATE batch_stock
    SET quantity = quantity + v_restore_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;
    
    -- Record restoration in stock_movements with organization_id
    INSERT INTO stock_movements (
      variant_id,
      movement_type,
      quantity,
      reference_id,
      bill_number,
      notes,
      organization_id
    ) VALUES (
      OLD.variant_id,
      'sale_delete',
      v_restore_qty,
      OLD.sale_id,
      v_batch.bill_number,
      'Stock restored: Sale deleted - ' || v_restore_qty || ' units returned to batch ' || v_batch.bill_number,
      v_org_id
    );
    
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;
  
  -- If remaining quantity (was from opening stock), just log it
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
      OLD.variant_id,
      'sale_delete',
      v_remaining_qty,
      OLD.sale_id,
      NULL,
      'Stock restored: Sale deleted - ' || v_remaining_qty || ' units from opening stock',
      v_org_id
    );
  END IF;
  
  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in sale_item_delete trigger: %', SQLERRM;
END;
$$;

-- Update trigger function: deduct_stock_on_purchase_return
CREATE OR REPLACE FUNCTION public.deduct_stock_on_purchase_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_return_date TIMESTAMPTZ;
  v_remaining_qty INTEGER := NEW.qty;
  v_batch RECORD;
  v_deduct_qty INTEGER;
  v_org_id UUID;
BEGIN
  -- Get return date and organization_id
  SELECT return_date, organization_id 
  INTO v_return_date, v_org_id
  FROM purchase_returns
  WHERE id = NEW.return_id;
  
  -- Deduct from batch_stock using FIFO (oldest first)
  FOR v_batch IN 
    SELECT id, bill_number, quantity
    FROM batch_stock
    WHERE variant_id = NEW.sku_id 
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
      NEW.sku_id,
      'purchase_return',
      -v_deduct_qty,
      NEW.return_id,
      v_batch.bill_number,
      'Purchase return: ' || v_deduct_qty || ' units returned from batch ' || v_batch.bill_number,
      v_org_id
    );
    
    v_remaining_qty := v_remaining_qty - v_deduct_qty;
  END LOOP;
  
  -- If remaining quantity (deduct from opening stock)
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
      NEW.sku_id,
      'purchase_return',
      -v_remaining_qty,
      NEW.return_id,
      NULL,
      'Purchase return from opening stock: ' || v_remaining_qty || ' units',
      v_org_id
    );
  END IF;
  
  -- Decrease total stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty - NEW.qty,
      updated_at = NOW()
  WHERE id = NEW.sku_id;
  
  RETURN NEW;
END;
$$;

-- Update trigger function: restore_stock_on_sale_return
CREATE OR REPLACE FUNCTION public.restore_stock_on_sale_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_remaining_qty INTEGER := NEW.quantity;
  v_batch RECORD;
  v_restore_qty INTEGER;
  v_return_date DATE;
  v_org_id UUID;
BEGIN
  -- Get return date and organization_id
  SELECT return_date, organization_id 
  INTO v_return_date, v_org_id
  FROM sale_returns
  WHERE id = NEW.return_id;
  
  -- Step 1: Increase total stock in product_variants
  UPDATE product_variants
  SET stock_qty = stock_qty + NEW.quantity,
      updated_at = NOW()
  WHERE id = NEW.variant_id;
  
  -- Step 2: Restore to batch_stock (FIFO - oldest batches first)
  FOR v_batch IN 
    SELECT id, bill_number, quantity
    FROM batch_stock
    WHERE variant_id = NEW.variant_id
    ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    
    v_restore_qty := LEAST(v_remaining_qty, NEW.quantity);
    
    -- Increase batch quantity
    UPDATE batch_stock
    SET quantity = quantity + v_restore_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;
    
    -- Log restoration in stock_movements with organization_id
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
      'sale_return',
      v_restore_qty,
      NEW.return_id,
      v_batch.bill_number,
      'Sale return: ' || v_restore_qty || ' units restored to batch ' || v_batch.bill_number,
      v_org_id
    );
    
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;
  
  -- Step 3: If remaining qty (no batch found), log as opening stock addition
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
      'sale_return',
      v_remaining_qty,
      NEW.return_id,
      NULL,
      'Sale return to opening stock: ' || v_remaining_qty || ' units',
      v_org_id
    );
  END IF;
  
  RETURN NEW;
END;
$$;