-- Fix handle_purchase_item_delete to skip already soft-deleted items
-- This prevents double stock movements when hard deleting after soft delete
CREATE OR REPLACE FUNCTION public.handle_purchase_item_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_purchase_date TIMESTAMPTZ;
  v_bill_number TEXT;
  v_org_id UUID;
BEGIN
  -- IMPORTANT: Skip stock adjustment if item was already soft-deleted
  -- This prevents double stock movements when hard deleting from recycle bin
  IF OLD.deleted_at IS NOT NULL THEN
    RETURN OLD;
  END IF;
  
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
$function$;