
-- Update soft_delete_purchase_bill to reverse stock
CREATE OR REPLACE FUNCTION public.soft_delete_purchase_bill(p_bill_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_org_id uuid;
BEGIN
  -- Get organization_id
  SELECT organization_id INTO v_org_id FROM purchase_bills WHERE id = p_bill_id;
  
  -- Loop through items and reverse stock
  FOR v_item IN 
    SELECT pi.sku_id, pi.qty, pi.bill_number
    FROM purchase_items pi
    WHERE pi.bill_id = p_bill_id AND pi.deleted_at IS NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      -- Decrease stock in product_variants
      UPDATE product_variants 
      SET stock_qty = stock_qty - v_item.qty,
          updated_at = now()
      WHERE id = v_item.sku_id;
      
      -- Update batch_stock
      UPDATE batch_stock 
      SET quantity = quantity - v_item.qty,
          updated_at = now()
      WHERE variant_id = v_item.sku_id 
        AND purchase_bill_id = p_bill_id;
      
      -- Add stock movement record
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number)
      VALUES (v_item.sku_id, 'soft_delete_purchase', -v_item.qty, p_bill_id, v_org_id, 'Stock reversed - purchase bill moved to recycle bin', v_item.bill_number);
    END IF;
  END LOOP;
  
  -- Soft delete the items
  UPDATE purchase_items 
  SET deleted_at = now(), deleted_by = p_user_id 
  WHERE bill_id = p_bill_id;
  
  -- Soft delete the bill
  UPDATE purchase_bills 
  SET deleted_at = now(), deleted_by = p_user_id 
  WHERE id = p_bill_id;
END;
$$;

-- Update restore_purchase_bill to re-apply stock
CREATE OR REPLACE FUNCTION public.restore_purchase_bill(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_org_id uuid;
BEGIN
  -- Get organization_id
  SELECT organization_id INTO v_org_id FROM purchase_bills WHERE id = p_bill_id;
  
  -- Restore the bill first
  UPDATE purchase_bills 
  SET deleted_at = NULL, deleted_by = NULL 
  WHERE id = p_bill_id;
  
  -- Restore items and re-apply stock
  FOR v_item IN 
    SELECT pi.sku_id, pi.qty, pi.bill_number
    FROM purchase_items pi
    WHERE pi.bill_id = p_bill_id AND pi.deleted_at IS NOT NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      -- Increase stock in product_variants
      UPDATE product_variants 
      SET stock_qty = stock_qty + v_item.qty,
          updated_at = now()
      WHERE id = v_item.sku_id;
      
      -- Update batch_stock
      UPDATE batch_stock 
      SET quantity = quantity + v_item.qty,
          updated_at = now()
      WHERE variant_id = v_item.sku_id 
        AND purchase_bill_id = p_bill_id;
      
      -- Add stock movement record
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number)
      VALUES (v_item.sku_id, 'restore_purchase', v_item.qty, p_bill_id, v_org_id, 'Stock restored - purchase bill recovered from recycle bin', v_item.bill_number);
    END IF;
  END LOOP;
  
  -- Restore the items
  UPDATE purchase_items 
  SET deleted_at = NULL, deleted_by = NULL 
  WHERE bill_id = p_bill_id;
END;
$$;

-- Update soft_delete_sale to return stock to inventory
CREATE OR REPLACE FUNCTION public.soft_delete_sale(p_sale_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_sale_number text;
BEGIN
  -- Get organization_id and sale_number
  SELECT organization_id, sale_number INTO v_org_id, v_sale_number FROM sales WHERE id = p_sale_id;
  
  -- Loop through items and return stock
  FOR v_item IN 
    SELECT si.variant_id, si.quantity
    FROM sale_items si
    WHERE si.sale_id = p_sale_id AND si.deleted_at IS NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      -- Increase stock in product_variants (return to inventory)
      UPDATE product_variants 
      SET stock_qty = stock_qty + v_item.quantity,
          updated_at = now()
      WHERE id = v_item.variant_id;
      
      -- Add stock movement record
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number)
      VALUES (v_item.variant_id, 'soft_delete_sale', v_item.quantity, p_sale_id, v_org_id, 'Stock returned - sale moved to recycle bin', v_sale_number);
    END IF;
  END LOOP;
  
  -- Soft delete the items
  UPDATE sale_items 
  SET deleted_at = now(), deleted_by = p_user_id 
  WHERE sale_id = p_sale_id;
  
  -- Soft delete the sale
  UPDATE sales 
  SET deleted_at = now(), deleted_by = p_user_id 
  WHERE id = p_sale_id;
END;
$$;

-- Update restore_sale to deduct stock again
CREATE OR REPLACE FUNCTION public.restore_sale(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_sale_number text;
BEGIN
  -- Get organization_id and sale_number
  SELECT organization_id, sale_number INTO v_org_id, v_sale_number FROM sales WHERE id = p_sale_id;
  
  -- Restore the sale first
  UPDATE sales 
  SET deleted_at = NULL, deleted_by = NULL 
  WHERE id = p_sale_id;
  
  -- Restore items and deduct stock
  FOR v_item IN 
    SELECT si.variant_id, si.quantity
    FROM sale_items si
    WHERE si.sale_id = p_sale_id AND si.deleted_at IS NOT NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      -- Decrease stock in product_variants
      UPDATE product_variants 
      SET stock_qty = stock_qty - v_item.quantity,
          updated_at = now()
      WHERE id = v_item.variant_id;
      
      -- Add stock movement record
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number)
      VALUES (v_item.variant_id, 'restore_sale', -v_item.quantity, p_sale_id, v_org_id, 'Stock deducted - sale recovered from recycle bin', v_sale_number);
    END IF;
  END LOOP;
  
  -- Restore the items
  UPDATE sale_items 
  SET deleted_at = NULL, deleted_by = NULL 
  WHERE sale_id = p_sale_id;
END;
$$;

-- Update soft_delete_sale_return to reverse stock (deduct what was returned)
CREATE OR REPLACE FUNCTION public.soft_delete_sale_return(p_return_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_return_number text;
BEGIN
  -- Get organization_id and return_number
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM sale_returns WHERE id = p_return_id;
  
  -- Loop through items and reverse stock
  FOR v_item IN 
    SELECT sri.variant_id, sri.quantity
    FROM sale_return_items sri
    WHERE sri.return_id = p_return_id AND sri.deleted_at IS NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      -- Decrease stock (reverse the return)
      UPDATE product_variants 
      SET stock_qty = stock_qty - v_item.quantity,
          updated_at = now()
      WHERE id = v_item.variant_id;
      
      -- Add stock movement record
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number)
      VALUES (v_item.variant_id, 'soft_delete_sale_return', -v_item.quantity, p_return_id, v_org_id, 'Stock reversed - sale return moved to recycle bin', v_return_number);
    END IF;
  END LOOP;
  
  -- Soft delete the items
  UPDATE sale_return_items 
  SET deleted_at = now(), deleted_by = p_user_id 
  WHERE return_id = p_return_id;
  
  -- Soft delete the return
  UPDATE sale_returns 
  SET deleted_at = now(), deleted_by = p_user_id 
  WHERE id = p_return_id;
END;
$$;

-- Update restore_sale_return to re-apply stock
CREATE OR REPLACE FUNCTION public.restore_sale_return(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_return_number text;
BEGIN
  -- Get organization_id and return_number
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM sale_returns WHERE id = p_return_id;
  
  -- Restore the return first
  UPDATE sale_returns 
  SET deleted_at = NULL, deleted_by = NULL 
  WHERE id = p_return_id;
  
  -- Restore items and re-apply stock
  FOR v_item IN 
    SELECT sri.variant_id, sri.quantity
    FROM sale_return_items sri
    WHERE sri.return_id = p_return_id AND sri.deleted_at IS NOT NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      -- Increase stock (items returned to inventory)
      UPDATE product_variants 
      SET stock_qty = stock_qty + v_item.quantity,
          updated_at = now()
      WHERE id = v_item.variant_id;
      
      -- Add stock movement record
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number)
      VALUES (v_item.variant_id, 'restore_sale_return', v_item.quantity, p_return_id, v_org_id, 'Stock restored - sale return recovered from recycle bin', v_return_number);
    END IF;
  END LOOP;
  
  -- Restore the items
  UPDATE sale_return_items 
  SET deleted_at = NULL, deleted_by = NULL 
  WHERE return_id = p_return_id;
END;
$$;

-- Update soft_delete_purchase_return to reverse stock (add back what was returned to supplier)
CREATE OR REPLACE FUNCTION public.soft_delete_purchase_return(p_return_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_return_number text;
BEGIN
  -- Get organization_id and return_number
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM purchase_returns WHERE id = p_return_id;
  
  -- Loop through items and reverse stock
  FOR v_item IN 
    SELECT pri.sku_id, pri.qty
    FROM purchase_return_items pri
    WHERE pri.return_id = p_return_id AND pri.deleted_at IS NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      -- Increase stock (reverse the return to supplier)
      UPDATE product_variants 
      SET stock_qty = stock_qty + v_item.qty,
          updated_at = now()
      WHERE id = v_item.sku_id;
      
      -- Add stock movement record
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number)
      VALUES (v_item.sku_id, 'soft_delete_purchase_return', v_item.qty, p_return_id, v_org_id, 'Stock reversed - purchase return moved to recycle bin', v_return_number);
    END IF;
  END LOOP;
  
  -- Soft delete the items
  UPDATE purchase_return_items 
  SET deleted_at = now(), deleted_by = p_user_id 
  WHERE return_id = p_return_id;
  
  -- Soft delete the return
  UPDATE purchase_returns 
  SET deleted_at = now(), deleted_by = p_user_id 
  WHERE id = p_return_id;
END;
$$;

-- Update restore_purchase_return to re-apply stock reduction
CREATE OR REPLACE FUNCTION public.restore_purchase_return(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_return_number text;
BEGIN
  -- Get organization_id and return_number
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM purchase_returns WHERE id = p_return_id;
  
  -- Restore the return first
  UPDATE purchase_returns 
  SET deleted_at = NULL, deleted_by = NULL 
  WHERE id = p_return_id;
  
  -- Restore items and deduct stock (items returned to supplier)
  FOR v_item IN 
    SELECT pri.sku_id, pri.qty
    FROM purchase_return_items pri
    WHERE pri.return_id = p_return_id AND pri.deleted_at IS NOT NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      -- Decrease stock (items returned to supplier)
      UPDATE product_variants 
      SET stock_qty = stock_qty - v_item.qty,
          updated_at = now()
      WHERE id = v_item.sku_id;
      
      -- Add stock movement record
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number)
      VALUES (v_item.sku_id, 'restore_purchase_return', -v_item.qty, p_return_id, v_org_id, 'Stock deducted - purchase return recovered from recycle bin', v_return_number);
    END IF;
  END LOOP;
  
  -- Restore the items
  UPDATE purchase_return_items 
  SET deleted_at = NULL, deleted_by = NULL 
  WHERE return_id = p_return_id;
END;
$$;
