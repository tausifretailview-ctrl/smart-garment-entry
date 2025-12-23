-- Fix the function search_path issue for handle_sale_item_update
CREATE OR REPLACE FUNCTION public.handle_sale_item_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qty_difference INTEGER;
  v_org_id UUID;
  v_product_type TEXT;
BEGIN
  -- If quantity hasn't changed, no stock adjustment needed
  IF OLD.quantity = NEW.quantity THEN
    RETURN NEW;
  END IF;
  
  -- Calculate the difference (positive = more sold, negative = less sold)
  v_qty_difference := NEW.quantity - OLD.quantity;
  
  -- Get organization_id from the sale
  SELECT organization_id INTO v_org_id FROM sales WHERE id = NEW.sale_id;
  
  -- Get product type to check if it's a service/combo (no stock tracking)
  SELECT product_type INTO v_product_type FROM products WHERE id = NEW.product_id;
  
  -- Skip stock adjustment for services and combos
  IF v_product_type IN ('service', 'combo') THEN
    RETURN NEW;
  END IF;
  
  -- Update product_variants stock (decrease for more sold, increase for less sold)
  UPDATE product_variants
  SET stock_qty = stock_qty - v_qty_difference,
      updated_at = NOW()
  WHERE id = NEW.variant_id;
  
  -- Handle batch_stock using FIFO for quantity changes
  IF v_qty_difference > 0 THEN
    -- More quantity sold - deduct from oldest batches first (FIFO)
    WITH batch_deductions AS (
      SELECT 
        id,
        quantity,
        SUM(quantity) OVER (ORDER BY purchase_date, created_at) as running_total,
        LAG(SUM(quantity) OVER (ORDER BY purchase_date, created_at), 1, 0) OVER (ORDER BY purchase_date, created_at) as prev_total
      FROM batch_stock
      WHERE variant_id = NEW.variant_id AND quantity > 0
      ORDER BY purchase_date, created_at
    )
    UPDATE batch_stock bs
    SET quantity = quantity - LEAST(
      quantity,
      GREATEST(0, v_qty_difference - bd.prev_total)
    )
    FROM batch_deductions bd
    WHERE bs.id = bd.id
      AND bd.prev_total < v_qty_difference;
  ELSIF v_qty_difference < 0 THEN
    -- Less quantity sold (quantity reduced) - add back to most recent batch
    UPDATE batch_stock
    SET quantity = quantity + ABS(v_qty_difference)
    WHERE id = (
      SELECT id FROM batch_stock
      WHERE variant_id = NEW.variant_id
      ORDER BY purchase_date DESC, created_at DESC
      LIMIT 1
    );
  END IF;
  
  -- Create stock movement record for audit
  INSERT INTO stock_movements (
    variant_id,
    organization_id,
    movement_type,
    quantity,
    reference_id,
    notes
  ) VALUES (
    NEW.variant_id,
    v_org_id,
    CASE WHEN v_qty_difference > 0 THEN 'sale_update_decrease' ELSE 'sale_update_increase' END,
    ABS(v_qty_difference),
    NEW.sale_id,
    'Sale item quantity updated from ' || OLD.quantity || ' to ' || NEW.quantity
  );
  
  RETURN NEW;
END;
$$;