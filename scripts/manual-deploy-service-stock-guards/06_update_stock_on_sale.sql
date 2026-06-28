-- 6. update_stock_on_sale
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
  v_org_id UUID;
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = NEW.variant_id
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO v_org_id FROM sales WHERE id = NEW.sale_id;

  SELECT stock_qty INTO v_current_stock FROM product_variants WHERE id = NEW.variant_id;
  IF v_current_stock < NEW.quantity THEN
    RAISE EXCEPTION 'Insufficient stock: needed %, available %', NEW.quantity, v_current_stock;
  END IF;

  FOR v_batch IN
    SELECT bill_number, quantity, id FROM batch_stock
    WHERE variant_id = NEW.variant_id AND quantity > 0 ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
    UPDATE batch_stock SET quantity = quantity - v_deduct_qty, updated_at = NOW() WHERE id = v_batch.id;
    v_bills_used := v_bills_used || v_batch.bill_number || '(' || v_deduct_qty || '), ';

    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'sale', -v_deduct_qty, NEW.sale_id, v_batch.bill_number, 'FIFO deduction: ' || v_deduct_qty || ' units from bill ' || v_batch.bill_number, v_org_id, auth.uid());

    v_remaining_qty := v_remaining_qty - v_deduct_qty;
  END LOOP;

  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'sale', -v_remaining_qty, NEW.sale_id, NULL, 'Sale from opening stock: ' || v_remaining_qty || ' units', v_org_id, auth.uid());
  END IF;

  UPDATE product_variants SET stock_qty = stock_qty - NEW.quantity, updated_at = NOW() WHERE id = NEW.variant_id;
  RETURN NEW;
END;
$function$;

