-- 3. handle_purchase_item_delete
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
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = OLD.sku_id
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN OLD;
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN RETURN OLD; END IF;

  SELECT pb.bill_date, pb.software_bill_no, pb.organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM purchase_bills pb WHERE pb.id = OLD.bill_id;

  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization ID not found for purchase bill'; END IF;

  UPDATE product_variants SET stock_qty = stock_qty - OLD.qty, updated_at = NOW() WHERE id = OLD.sku_id;
  UPDATE batch_stock SET quantity = quantity - OLD.qty, updated_at = NOW() WHERE variant_id = OLD.sku_id AND bill_number = v_bill_number;
  DELETE FROM batch_stock WHERE variant_id = OLD.sku_id AND bill_number = v_bill_number AND quantity <= 0;

  INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
  VALUES (OLD.sku_id, 'purchase_delete', -OLD.qty, OLD.bill_id, v_bill_number, 'Stock decreased: Purchase item deleted from bill ' || v_bill_number, v_org_id, auth.uid());

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION 'Error in purchase_item_delete trigger: %', SQLERRM;
END;
$function$;

