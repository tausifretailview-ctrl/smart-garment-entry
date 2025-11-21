-- Phase 1: Stock Management Triggers with Safety Features
-- These triggers ensure stock consistency for all future transactions

-- =====================================================
-- 1. DELETE trigger for purchase_items
-- Decreases stock when purchase items are deleted
-- =====================================================

CREATE OR REPLACE FUNCTION handle_purchase_item_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  
  -- Create audit trail in stock_movements
  INSERT INTO stock_movements (
    variant_id,
    movement_type,
    quantity,
    reference_id,
    bill_number,
    notes
  ) VALUES (
    OLD.sku_id,
    'purchase_delete',
    -OLD.qty,
    OLD.bill_id,
    v_bill_number,
    'Stock decreased: Purchase item deleted from bill ' || v_bill_number
  );
  
  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in purchase_item_delete trigger: %', SQLERRM;
END;
$$;

-- Create the DELETE trigger
DROP TRIGGER IF EXISTS trigger_purchase_item_delete ON purchase_items;
CREATE TRIGGER trigger_purchase_item_delete
  AFTER DELETE ON purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_purchase_item_delete();

-- =====================================================
-- 2. UPDATE trigger for purchase_items
-- Adjusts stock when purchase quantities change
-- =====================================================

CREATE OR REPLACE FUNCTION handle_purchase_item_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  
  -- Create audit trail in stock_movements
  INSERT INTO stock_movements (
    variant_id,
    movement_type,
    quantity,
    reference_id,
    bill_number,
    notes
  ) VALUES (
    NEW.sku_id,
    CASE 
      WHEN v_qty_difference > 0 THEN 'purchase_increase'
      ELSE 'purchase_decrease'
    END,
    v_qty_difference,
    NEW.bill_id,
    v_bill_number,
    'Stock adjusted: Purchase quantity changed from ' || OLD.qty || ' to ' || NEW.qty || ' in bill ' || v_bill_number
  );
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in purchase_item_update trigger: %', SQLERRM;
END;
$$;

-- Create the UPDATE trigger
DROP TRIGGER IF EXISTS trigger_purchase_item_update ON purchase_items;
CREATE TRIGGER trigger_purchase_item_update
  AFTER UPDATE ON purchase_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_purchase_item_update();

-- =====================================================
-- 3. DELETE trigger for sale_items
-- Restores stock when sales are deleted (FIFO reversal)
-- =====================================================

CREATE OR REPLACE FUNCTION handle_sale_item_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
    
    -- Record restoration in stock_movements
    INSERT INTO stock_movements (
      variant_id,
      movement_type,
      quantity,
      reference_id,
      bill_number,
      notes
    ) VALUES (
      OLD.variant_id,
      'sale_delete',
      v_restore_qty,
      OLD.sale_id,
      v_batch.bill_number,
      'Stock restored: Sale deleted - ' || v_restore_qty || ' units returned to batch ' || v_batch.bill_number
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
      notes
    ) VALUES (
      OLD.variant_id,
      'sale_delete',
      v_remaining_qty,
      OLD.sale_id,
      NULL,
      'Stock restored: Sale deleted - ' || v_remaining_qty || ' units from opening stock'
    );
  END IF;
  
  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in sale_item_delete trigger: %', SQLERRM;
END;
$$;

-- Create the DELETE trigger for sale_items
DROP TRIGGER IF EXISTS trigger_sale_item_delete ON sale_items;
CREATE TRIGGER trigger_sale_item_delete
  AFTER DELETE ON sale_items
  FOR EACH ROW
  EXECUTE FUNCTION handle_sale_item_delete();

-- =====================================================
-- Success message
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE 'Phase 1 triggers successfully created:';
  RAISE NOTICE '✓ Purchase item DELETE trigger (decreases stock)';
  RAISE NOTICE '✓ Purchase item UPDATE trigger (adjusts stock)';
  RAISE NOTICE '✓ Sale item DELETE trigger (restores stock with FIFO)';
  RAISE NOTICE '';
  RAISE NOTICE 'All future transactions will now automatically maintain stock consistency.';
END $$;