-- Function to handle sale return item deletion (reverse stock restoration)
CREATE OR REPLACE FUNCTION public.handle_sale_return_item_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_remaining_qty INTEGER := OLD.quantity;
  v_batch RECORD;
  v_deduct_qty INTEGER;
BEGIN
  -- Get organization_id from the sale return
  SELECT organization_id INTO v_org_id
  FROM sale_returns
  WHERE id = OLD.return_id;

  -- Step 1: Deduct stock from product_variants (reverse the restoration)
  UPDATE product_variants
  SET stock_qty = stock_qty - OLD.quantity,
      updated_at = NOW()
  WHERE id = OLD.variant_id;

  -- Step 2: Deduct from batch_stock using FIFO (oldest first)
  FOR v_batch IN 
    SELECT id, bill_number, quantity
    FROM batch_stock
    WHERE variant_id = OLD.variant_id
      AND quantity > 0
    ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    
    v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
    
    UPDATE batch_stock
    SET quantity = quantity - v_deduct_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;
    
    -- Record stock movement
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
      'sale_return_delete',
      -v_deduct_qty,
      OLD.return_id,
      v_batch.bill_number,
      'Sale return deleted: ' || v_deduct_qty || ' units deducted from batch ' || v_batch.bill_number,
      v_org_id
    );
    
    v_remaining_qty := v_remaining_qty - v_deduct_qty;
  END LOOP;

  -- If remaining qty (was from opening stock), log it
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
      'sale_return_delete',
      -v_remaining_qty,
      OLD.return_id,
      NULL,
      'Sale return deleted: ' || v_remaining_qty || ' units deducted from opening stock',
      v_org_id
    );
  END IF;

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in sale_return_item_delete trigger: %', SQLERRM;
END;
$$;

-- Function to handle purchase return item deletion (reverse stock deduction)
CREATE OR REPLACE FUNCTION public.handle_purchase_return_item_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_batch RECORD;
  v_remaining_qty INTEGER := OLD.qty;
  v_restore_qty INTEGER;
BEGIN
  -- Get organization_id from the purchase return
  SELECT organization_id INTO v_org_id
  FROM purchase_returns
  WHERE id = OLD.return_id;

  -- Step 1: Add stock back to product_variants (reverse the deduction)
  UPDATE product_variants
  SET stock_qty = stock_qty + OLD.qty,
      updated_at = NOW()
  WHERE id = OLD.sku_id;

  -- Step 2: Restore to batch_stock (FIFO - oldest batches first)
  FOR v_batch IN 
    SELECT id, bill_number, quantity
    FROM batch_stock
    WHERE variant_id = OLD.sku_id
    ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    
    v_restore_qty := LEAST(v_remaining_qty, OLD.qty);
    
    UPDATE batch_stock
    SET quantity = quantity + v_restore_qty,
        updated_at = NOW()
    WHERE id = v_batch.id;
    
    -- Record stock movement
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
      'purchase_return_delete',
      v_restore_qty,
      OLD.return_id,
      v_batch.bill_number,
      'Purchase return deleted: ' || v_restore_qty || ' units restored to batch ' || v_batch.bill_number,
      v_org_id
    );
    
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;

  -- If remaining qty (no batch found), log as opening stock restoration
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
      OLD.sku_id,
      'purchase_return_delete',
      v_remaining_qty,
      OLD.return_id,
      NULL,
      'Purchase return deleted: ' || v_remaining_qty || ' units restored to opening stock',
      v_org_id
    );
  END IF;

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in purchase_return_item_delete trigger: %', SQLERRM;
END;
$$;

-- Create trigger for sale return item deletion
CREATE TRIGGER trigger_sale_return_item_delete
  BEFORE DELETE ON sale_return_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_sale_return_item_delete();

-- Create trigger for purchase return item deletion
CREATE TRIGGER trigger_purchase_return_item_delete
  BEFORE DELETE ON purchase_return_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_purchase_return_item_delete();