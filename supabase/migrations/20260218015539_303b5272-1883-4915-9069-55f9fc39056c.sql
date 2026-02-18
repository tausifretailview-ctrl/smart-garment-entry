
-- Phase A: Add user_id column to stock_movements
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS user_id UUID;

-- ============================================================
-- 1. update_stock_on_purchase
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_stock_on_purchase()
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
  SELECT bill_date, software_bill_no, organization_id 
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM purchase_bills
  WHERE id = NEW.bill_id;
  
  UPDATE product_variants
  SET stock_qty = stock_qty + NEW.qty, updated_at = NOW()
  WHERE id = NEW.sku_id;
  
  INSERT INTO batch_stock (variant_id, bill_number, quantity, purchase_bill_id, purchase_date, organization_id)
  VALUES (NEW.sku_id, v_bill_number, NEW.qty, NEW.bill_id, v_purchase_date, v_org_id)
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET quantity = batch_stock.quantity + EXCLUDED.quantity, updated_at = NOW();
  
  INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
  VALUES (NEW.sku_id, 'purchase', NEW.qty, NEW.bill_id, v_bill_number, 'Stock added from purchase bill ' || v_bill_number, v_org_id, auth.uid());
  
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 2. handle_purchase_item_update
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_purchase_item_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qty_difference INTEGER;
  v_purchase_date TIMESTAMPTZ;
  v_bill_number TEXT;
  v_org_id UUID;
BEGIN
  IF OLD.qty = NEW.qty THEN RETURN NEW; END IF;
  v_qty_difference := NEW.qty - OLD.qty;
  
  SELECT pb.bill_date, pb.software_bill_no, pb.organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM purchase_bills pb WHERE pb.id = NEW.bill_id;
  
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization ID not found for purchase bill'; END IF;
  
  UPDATE product_variants SET stock_qty = stock_qty + v_qty_difference, updated_at = NOW() WHERE id = NEW.sku_id;
  UPDATE batch_stock SET quantity = quantity + v_qty_difference, updated_at = NOW() WHERE variant_id = NEW.sku_id AND bill_number = v_bill_number;
  
  INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
  VALUES (NEW.sku_id, CASE WHEN v_qty_difference > 0 THEN 'purchase_increase' ELSE 'purchase_decrease' END, v_qty_difference, NEW.bill_id, v_bill_number, 'Stock adjusted: Purchase quantity changed from ' || OLD.qty || ' to ' || NEW.qty || ' in bill ' || v_bill_number, v_org_id, auth.uid());
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION 'Error in purchase_item_update trigger: %', SQLERRM;
END;
$function$;

-- ============================================================
-- 3. handle_purchase_item_delete
-- ============================================================
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

-- ============================================================
-- 4. update_stock_on_sale
-- ============================================================
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
  SELECT organization_id INTO v_org_id FROM sales WHERE id = NEW.sale_id;
  
  SELECT p.product_type INTO v_product_type
  FROM product_variants pv JOIN products p ON p.id = pv.product_id
  WHERE pv.id = NEW.variant_id;
  
  IF v_product_type = 'service' OR v_product_type = 'combo' THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'sale', -NEW.quantity, NEW.sale_id, NULL, 'Service/Combo sale: ' || NEW.quantity || ' units (no stock tracking)', v_org_id, auth.uid());
    RETURN NEW;
  END IF;
  
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

-- ============================================================
-- 5. handle_sale_item_update
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_sale_item_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_qty_difference INTEGER;
  v_org_id UUID;
  v_product_type TEXT;
BEGIN
  IF OLD.quantity = NEW.quantity THEN RETURN NEW; END IF;
  v_qty_difference := NEW.quantity - OLD.quantity;
  SELECT organization_id INTO v_org_id FROM sales WHERE id = NEW.sale_id;
  SELECT product_type INTO v_product_type FROM products WHERE id = NEW.product_id;
  IF v_product_type IN ('service', 'combo') THEN RETURN NEW; END IF;
  
  UPDATE product_variants SET stock_qty = stock_qty - v_qty_difference, updated_at = NOW() WHERE id = NEW.variant_id;
  
  IF v_qty_difference > 0 THEN
    WITH batch_deductions AS (
      SELECT id, quantity, SUM(quantity) OVER (ORDER BY purchase_date, created_at) as running_total,
        LAG(SUM(quantity) OVER (ORDER BY purchase_date, created_at), 1, 0) OVER (ORDER BY purchase_date, created_at) as prev_total
      FROM batch_stock WHERE variant_id = NEW.variant_id AND quantity > 0 ORDER BY purchase_date, created_at
    )
    UPDATE batch_stock bs SET quantity = quantity - LEAST(quantity, GREATEST(0, v_qty_difference - bd.prev_total))
    FROM batch_deductions bd WHERE bs.id = bd.id AND bd.prev_total < v_qty_difference;
  ELSIF v_qty_difference < 0 THEN
    UPDATE batch_stock SET quantity = quantity + ABS(v_qty_difference)
    WHERE id = (SELECT id FROM batch_stock WHERE variant_id = NEW.variant_id ORDER BY purchase_date DESC, created_at DESC LIMIT 1);
  END IF;
  
  INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, notes, user_id)
  VALUES (NEW.variant_id, v_org_id, CASE WHEN v_qty_difference > 0 THEN 'sale_update_decrease' ELSE 'sale_update_increase' END, ABS(v_qty_difference), NEW.sale_id, 'Sale item quantity updated from ' || OLD.quantity || ' to ' || NEW.quantity, auth.uid());
  
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 6. handle_sale_item_delete
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_sale_item_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sale_date TIMESTAMPTZ;
  v_sale_number TEXT;
  v_org_id UUID;
  v_remaining_qty INTEGER := OLD.quantity;
  v_batch RECORD;
  v_restore_qty INTEGER;
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN RETURN OLD; END IF;
  
  SELECT s.sale_date, s.sale_number, s.organization_id INTO v_sale_date, v_sale_number, v_org_id FROM sales s WHERE s.id = OLD.sale_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Organization ID not found for sale'; END IF;
  
  UPDATE product_variants SET stock_qty = stock_qty + OLD.quantity, updated_at = NOW() WHERE id = OLD.variant_id;
  
  FOR v_batch IN SELECT bill_number, quantity, id FROM batch_stock WHERE variant_id = OLD.variant_id ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_restore_qty := LEAST(v_remaining_qty, OLD.quantity);
    UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = NOW() WHERE id = v_batch.id;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'sale_delete', v_restore_qty, OLD.sale_id, v_batch.bill_number, 'Stock restored: Sale deleted - ' || v_restore_qty || ' units returned to batch ' || v_batch.bill_number, v_org_id, auth.uid());
    
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;
  
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'sale_delete', v_remaining_qty, OLD.sale_id, NULL, 'Stock restored: Sale deleted - ' || v_remaining_qty || ' units from opening stock', v_org_id, auth.uid());
  END IF;
  
  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION 'Error in sale_item_delete trigger: %', SQLERRM;
END;
$function$;

-- ============================================================
-- 7. restore_stock_on_sale_return
-- ============================================================
CREATE OR REPLACE FUNCTION public.restore_stock_on_sale_return()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining_qty INTEGER := NEW.quantity;
  v_batch RECORD;
  v_restore_qty INTEGER;
  v_return_date DATE;
  v_org_id UUID;
BEGIN
  SELECT return_date, organization_id INTO v_return_date, v_org_id FROM sale_returns WHERE id = NEW.return_id;
  
  UPDATE product_variants SET stock_qty = stock_qty + NEW.quantity, updated_at = NOW() WHERE id = NEW.variant_id;
  
  FOR v_batch IN SELECT id, bill_number, quantity FROM batch_stock WHERE variant_id = NEW.variant_id ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_restore_qty := LEAST(v_remaining_qty, NEW.quantity);
    UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = NOW() WHERE id = v_batch.id;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'sale_return', v_restore_qty, NEW.return_id, v_batch.bill_number, 'Sale return: ' || v_restore_qty || ' units restored to batch ' || v_batch.bill_number, v_org_id, auth.uid());
    
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;
  
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'sale_return', v_remaining_qty, NEW.return_id, NULL, 'Sale return to opening stock: ' || v_remaining_qty || ' units', v_org_id, auth.uid());
  END IF;
  
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 8. handle_sale_return_item_delete
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_sale_return_item_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_remaining_qty INTEGER := OLD.quantity;
  v_batch RECORD;
  v_deduct_qty INTEGER;
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN RETURN OLD; END IF;
  SELECT organization_id INTO v_org_id FROM sale_returns WHERE id = OLD.return_id;
  
  UPDATE product_variants SET stock_qty = stock_qty - OLD.quantity, updated_at = NOW() WHERE id = OLD.variant_id;
  
  FOR v_batch IN SELECT id, bill_number, quantity FROM batch_stock WHERE variant_id = OLD.variant_id AND quantity > 0 ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
    UPDATE batch_stock SET quantity = quantity - v_deduct_qty, updated_at = NOW() WHERE id = v_batch.id;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'sale_return_delete', -v_deduct_qty, OLD.return_id, v_batch.bill_number, 'Sale return deleted: ' || v_deduct_qty || ' units deducted from batch ' || v_batch.bill_number, v_org_id, auth.uid());
    
    v_remaining_qty := v_remaining_qty - v_deduct_qty;
  END LOOP;
  
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'sale_return_delete', -v_remaining_qty, OLD.return_id, NULL, 'Sale return deleted: ' || v_remaining_qty || ' units deducted from opening stock', v_org_id, auth.uid());
  END IF;
  
  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION 'Error in sale_return_item_delete trigger: %', SQLERRM;
END;
$function$;

-- ============================================================
-- 9. deduct_stock_on_purchase_return
-- ============================================================
CREATE OR REPLACE FUNCTION public.deduct_stock_on_purchase_return()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_return_date TIMESTAMPTZ;
  v_remaining_qty INTEGER := NEW.qty;
  v_batch RECORD;
  v_deduct_qty INTEGER;
  v_org_id UUID;
  v_current_stock INTEGER;
BEGIN
  SELECT return_date, organization_id INTO v_return_date, v_org_id FROM purchase_returns WHERE id = NEW.return_id;
  SELECT stock_qty INTO v_current_stock FROM product_variants WHERE id = NEW.sku_id;
  IF v_current_stock < NEW.qty THEN
    RAISE EXCEPTION 'No Stock available For Return. Available: %, Requested: %', v_current_stock, NEW.qty;
  END IF;
  
  FOR v_batch IN SELECT id, bill_number, quantity FROM batch_stock WHERE variant_id = NEW.sku_id AND quantity > 0 ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
    UPDATE batch_stock SET quantity = quantity - v_deduct_qty, updated_at = NOW() WHERE id = v_batch.id;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.sku_id, 'purchase_return', -v_deduct_qty, NEW.return_id, v_batch.bill_number, 'Purchase return: ' || v_deduct_qty || ' units returned from batch ' || v_batch.bill_number, v_org_id, auth.uid());
    
    v_remaining_qty := v_remaining_qty - v_deduct_qty;
  END LOOP;
  
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.sku_id, 'purchase_return', -v_remaining_qty, NEW.return_id, NULL, 'Purchase return from opening stock: ' || v_remaining_qty || ' units', v_org_id, auth.uid());
  END IF;
  
  UPDATE product_variants SET stock_qty = stock_qty - NEW.qty, updated_at = NOW() WHERE id = NEW.sku_id;
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 10. handle_purchase_return_item_delete
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_purchase_return_item_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_batch RECORD;
  v_remaining_qty INTEGER := OLD.qty;
  v_restore_qty INTEGER;
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN RETURN OLD; END IF;
  SELECT organization_id INTO v_org_id FROM purchase_returns WHERE id = OLD.return_id;
  
  UPDATE product_variants SET stock_qty = stock_qty + OLD.qty, updated_at = NOW() WHERE id = OLD.sku_id;
  
  FOR v_batch IN SELECT id, bill_number, quantity FROM batch_stock WHERE variant_id = OLD.sku_id ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_restore_qty := LEAST(v_remaining_qty, OLD.qty);
    UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = NOW() WHERE id = v_batch.id;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.sku_id, 'purchase_return_delete', v_restore_qty, OLD.return_id, v_batch.bill_number, 'Purchase return deleted: ' || v_restore_qty || ' units restored to batch ' || v_batch.bill_number, v_org_id, auth.uid());
    
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;
  
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.sku_id, 'purchase_return_delete', v_remaining_qty, OLD.return_id, NULL, 'Purchase return deleted: ' || v_remaining_qty || ' units restored to opening stock', v_org_id, auth.uid());
  END IF;
  
  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN RAISE EXCEPTION 'Error in purchase_return_item_delete trigger: %', SQLERRM;
END;
$function$;

-- ============================================================
-- 11. update_stock_on_challan
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_stock_on_challan()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_remaining_qty INTEGER := NEW.quantity;
  v_batch RECORD;
  v_deduct_qty INTEGER;
  v_current_stock INTEGER;
  v_org_id UUID;
  v_product_type TEXT;
BEGIN
  SELECT organization_id INTO v_org_id FROM delivery_challans WHERE id = NEW.challan_id;
  SELECT p.product_type INTO v_product_type FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = NEW.variant_id;
  
  IF v_product_type IN ('service', 'combo') THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'challan', -NEW.quantity, NEW.challan_id, 'Service/Combo challan (no stock tracking)', v_org_id, auth.uid());
    RETURN NEW;
  END IF;
  
  SELECT stock_qty INTO v_current_stock FROM product_variants WHERE id = NEW.variant_id;
  IF v_current_stock < NEW.quantity THEN
    RAISE EXCEPTION 'Insufficient stock: needed %, available %', NEW.quantity, v_current_stock;
  END IF;
  
  FOR v_batch IN SELECT bill_number, quantity, id FROM batch_stock WHERE variant_id = NEW.variant_id AND quantity > 0 ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
    UPDATE batch_stock SET quantity = quantity - v_deduct_qty, updated_at = NOW() WHERE id = v_batch.id;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'challan', -v_deduct_qty, NEW.challan_id, v_batch.bill_number, 'Challan FIFO: ' || v_deduct_qty || ' from batch ' || v_batch.bill_number, v_org_id, auth.uid());
    
    v_remaining_qty := v_remaining_qty - v_deduct_qty;
  END LOOP;
  
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'challan', -v_remaining_qty, NEW.challan_id, 'Challan from opening stock', v_org_id, auth.uid());
  END IF;
  
  UPDATE product_variants SET stock_qty = stock_qty - NEW.quantity, updated_at = NOW() WHERE id = NEW.variant_id;
  RETURN NEW;
END;
$function$;

-- ============================================================
-- 12. handle_challan_item_delete
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_challan_item_delete()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org_id UUID;
  v_remaining_qty INTEGER := OLD.quantity;
  v_batch RECORD;
  v_restore_qty INTEGER;
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN RETURN OLD; END IF;
  SELECT organization_id INTO v_org_id FROM delivery_challans WHERE id = OLD.challan_id;
  
  UPDATE product_variants SET stock_qty = stock_qty + OLD.quantity, updated_at = NOW() WHERE id = OLD.variant_id;
  
  FOR v_batch IN SELECT bill_number, id FROM batch_stock WHERE variant_id = OLD.variant_id ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_restore_qty := LEAST(v_remaining_qty, OLD.quantity);
    UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = NOW() WHERE id = v_batch.id;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'challan_delete', v_restore_qty, OLD.challan_id, v_batch.bill_number, 'Challan deleted: ' || v_restore_qty || ' restored to batch ' || v_batch.bill_number, v_org_id, auth.uid());
    
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;
  
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'challan_delete', v_remaining_qty, OLD.challan_id, 'Challan deleted: restored to opening stock', v_org_id, auth.uid());
  END IF;
  
  RETURN OLD;
END;
$function$;

-- ============================================================
-- 13. soft_delete_sale
-- ============================================================
CREATE OR REPLACE FUNCTION public.soft_delete_sale(p_sale_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_sale_number text;
BEGIN
  SELECT organization_id, sale_number INTO v_org_id, v_sale_number FROM sales WHERE id = p_sale_id;
  
  FOR v_item IN SELECT si.variant_id, si.quantity FROM sale_items si WHERE si.sale_id = p_sale_id AND si.deleted_at IS NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty + v_item.quantity, updated_at = now() WHERE id = v_item.variant_id;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.variant_id, 'soft_delete_sale', v_item.quantity, p_sale_id, v_org_id, 'Stock returned - sale moved to recycle bin', v_sale_number, auth.uid());
    END IF;
  END LOOP;
  
  UPDATE sale_items SET deleted_at = now(), deleted_by = p_user_id WHERE sale_id = p_sale_id;
  UPDATE sales SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_sale_id;
END;
$function$;

-- ============================================================
-- 14. restore_sale
-- ============================================================
CREATE OR REPLACE FUNCTION public.restore_sale(p_sale_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_sale_number text;
BEGIN
  SELECT organization_id, sale_number INTO v_org_id, v_sale_number FROM sales WHERE id = p_sale_id;
  
  UPDATE sales SET deleted_at = NULL, deleted_by = NULL WHERE id = p_sale_id;
  
  FOR v_item IN SELECT si.variant_id, si.quantity FROM sale_items si WHERE si.sale_id = p_sale_id AND si.deleted_at IS NOT NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty - v_item.quantity, updated_at = now() WHERE id = v_item.variant_id;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.variant_id, 'restore_sale', -v_item.quantity, p_sale_id, v_org_id, 'Stock deducted - sale recovered from recycle bin', v_sale_number, auth.uid());
    END IF;
  END LOOP;
  
  UPDATE sale_items SET deleted_at = NULL, deleted_by = NULL WHERE sale_id = p_sale_id;
END;
$function$;

-- ============================================================
-- 15. soft_delete_purchase_bill
-- ============================================================
CREATE OR REPLACE FUNCTION public.soft_delete_purchase_bill(p_bill_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM purchase_bills WHERE id = p_bill_id;
  
  FOR v_item IN SELECT pi.sku_id, pi.qty, pi.bill_number FROM purchase_items pi WHERE pi.bill_id = p_bill_id AND pi.deleted_at IS NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty - v_item.qty, updated_at = now() WHERE id = v_item.sku_id;
      UPDATE batch_stock SET quantity = quantity - v_item.qty, updated_at = now() WHERE variant_id = v_item.sku_id AND purchase_bill_id = p_bill_id;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.sku_id, 'soft_delete_purchase', -v_item.qty, p_bill_id, v_org_id, 'Stock reversed - purchase bill moved to recycle bin', v_item.bill_number, auth.uid());
    END IF;
  END LOOP;
  
  UPDATE purchase_items SET deleted_at = now(), deleted_by = p_user_id WHERE bill_id = p_bill_id;
  UPDATE purchase_bills SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_bill_id;
END;
$function$;

-- ============================================================
-- 16. restore_purchase_bill
-- ============================================================
CREATE OR REPLACE FUNCTION public.restore_purchase_bill(p_bill_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM purchase_bills WHERE id = p_bill_id;
  
  UPDATE purchase_bills SET deleted_at = NULL, deleted_by = NULL WHERE id = p_bill_id;
  
  FOR v_item IN SELECT pi.sku_id, pi.qty, pi.bill_number FROM purchase_items pi WHERE pi.bill_id = p_bill_id AND pi.deleted_at IS NOT NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty + v_item.qty, updated_at = now() WHERE id = v_item.sku_id;
      UPDATE batch_stock SET quantity = quantity + v_item.qty, updated_at = now() WHERE variant_id = v_item.sku_id AND purchase_bill_id = p_bill_id;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.sku_id, 'restore_purchase', v_item.qty, p_bill_id, v_org_id, 'Stock restored - purchase bill recovered from recycle bin', v_item.bill_number, auth.uid());
    END IF;
  END LOOP;
  
  UPDATE purchase_items SET deleted_at = NULL, deleted_by = NULL WHERE bill_id = p_bill_id;
END;
$function$;

-- ============================================================
-- 17. soft_delete_sale_return
-- ============================================================
CREATE OR REPLACE FUNCTION public.soft_delete_sale_return(p_return_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_return_number text;
BEGIN
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM sale_returns WHERE id = p_return_id;
  
  FOR v_item IN SELECT sri.variant_id, sri.quantity FROM sale_return_items sri WHERE sri.return_id = p_return_id AND sri.deleted_at IS NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty - v_item.quantity, updated_at = now() WHERE id = v_item.variant_id;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.variant_id, 'soft_delete_sale_return', -v_item.quantity, p_return_id, v_org_id, 'Stock reversed - sale return moved to recycle bin', v_return_number, auth.uid());
    END IF;
  END LOOP;
  
  UPDATE sale_return_items SET deleted_at = now(), deleted_by = p_user_id WHERE return_id = p_return_id;
  UPDATE sale_returns SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_return_id;
END;
$function$;

-- ============================================================
-- 18. restore_sale_return
-- ============================================================
CREATE OR REPLACE FUNCTION public.restore_sale_return(p_return_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_return_number text;
BEGIN
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM sale_returns WHERE id = p_return_id;
  
  UPDATE sale_returns SET deleted_at = NULL, deleted_by = NULL WHERE id = p_return_id;
  
  FOR v_item IN SELECT sri.variant_id, sri.quantity FROM sale_return_items sri WHERE sri.return_id = p_return_id AND sri.deleted_at IS NOT NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty + v_item.quantity, updated_at = now() WHERE id = v_item.variant_id;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.variant_id, 'restore_sale_return', v_item.quantity, p_return_id, v_org_id, 'Stock restored - sale return recovered from recycle bin', v_return_number, auth.uid());
    END IF;
  END LOOP;
  
  UPDATE sale_return_items SET deleted_at = NULL, deleted_by = NULL WHERE return_id = p_return_id;
END;
$function$;

-- ============================================================
-- 19. soft_delete_purchase_return
-- ============================================================
CREATE OR REPLACE FUNCTION public.soft_delete_purchase_return(p_return_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_return_number text;
BEGIN
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM purchase_returns WHERE id = p_return_id;
  
  FOR v_item IN SELECT pri.sku_id, pri.qty FROM purchase_return_items pri WHERE pri.return_id = p_return_id AND pri.deleted_at IS NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty + v_item.qty, updated_at = now() WHERE id = v_item.sku_id;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.sku_id, 'soft_delete_purchase_return', v_item.qty, p_return_id, v_org_id, 'Stock reversed - purchase return moved to recycle bin', v_return_number, auth.uid());
    END IF;
  END LOOP;
  
  UPDATE purchase_return_items SET deleted_at = now(), deleted_by = p_user_id WHERE return_id = p_return_id;
  UPDATE purchase_returns SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_return_id;
END;
$function$;

-- ============================================================
-- 20. restore_purchase_return
-- ============================================================
CREATE OR REPLACE FUNCTION public.restore_purchase_return(p_return_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_return_number text;
BEGIN
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM purchase_returns WHERE id = p_return_id;
  
  UPDATE purchase_returns SET deleted_at = NULL, deleted_by = NULL WHERE id = p_return_id;
  
  FOR v_item IN SELECT pri.sku_id, pri.qty FROM purchase_return_items pri WHERE pri.return_id = p_return_id AND pri.deleted_at IS NOT NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty - v_item.qty, updated_at = now() WHERE id = v_item.sku_id;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.sku_id, 'restore_purchase_return', -v_item.qty, p_return_id, v_org_id, 'Stock deducted - purchase return recovered from recycle bin', v_return_number, auth.uid());
    END IF;
  END LOOP;
  
  UPDATE purchase_return_items SET deleted_at = NULL, deleted_by = NULL WHERE return_id = p_return_id;
END;
$function$;

-- ============================================================
-- 21. fix_stock_discrepancies (updated with user_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.fix_stock_discrepancies(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(fixed_count integer, details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fixed_count integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_record RECORD;
BEGIN
  FOR v_record IN SELECT * FROM detect_stock_discrepancies(p_organization_id)
  LOOP
    UPDATE product_variants SET stock_qty = v_record.calculated_stock_qty, updated_at = NOW() WHERE id = v_record.variant_id;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, notes, organization_id, user_id)
    SELECT v_record.variant_id, 'reconciliation', 0,
      'Stock reconciliation: adjusted from ' || v_record.current_stock_qty || ' to ' || v_record.calculated_stock_qty || ' (adjustment: ' || (-v_record.discrepancy) || ')',
      pv.organization_id, auth.uid()
    FROM product_variants pv WHERE pv.id = v_record.variant_id;
    
    v_fixed_count := v_fixed_count + 1;
    v_details := v_details || jsonb_build_object(
      'barcode', v_record.barcode, 'product_name', v_record.product_name, 'size', v_record.size,
      'old_qty', v_record.current_stock_qty, 'new_qty', v_record.calculated_stock_qty, 'adjustment', -v_record.discrepancy
    );
  END LOOP;
  
  RETURN QUERY SELECT v_fixed_count, v_details;
END;
$function$;

-- ============================================================
-- 22. reset_stock_from_transactions (updated with user_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.reset_stock_from_transactions(p_organization_id uuid)
 RETURNS TABLE(fixed_count integer, details jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_fixed_count integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_record RECORD;
BEGIN
  FOR v_record IN 
    WITH variant_transactions AS (
      SELECT pv.id as variant_id, pv.barcode, p.product_name, pv.size,
        pv.stock_qty as current_stock_qty, COALESCE(pv.opening_qty, 0) as opening_qty,
        COALESCE((SELECT SUM(pi.qty) FROM purchase_items pi JOIN purchase_bills pb ON pb.id = pi.bill_id WHERE pi.sku_id = pv.id AND pi.deleted_at IS NULL AND pb.deleted_at IS NULL), 0) as purchase_qty,
        COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.variant_id = pv.id AND si.deleted_at IS NULL AND s.deleted_at IS NULL), 0) as sale_qty,
        COALESCE((SELECT SUM(pri.qty) FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.return_id WHERE pri.sku_id = pv.id AND pri.deleted_at IS NULL AND pr.deleted_at IS NULL), 0) as purchase_return_qty,
        COALESCE((SELECT SUM(sri.quantity) FROM sale_return_items sri JOIN sale_returns sr ON sr.id = sri.return_id WHERE sri.variant_id = pv.id AND sri.deleted_at IS NULL AND sr.deleted_at IS NULL), 0) as sale_return_qty
      FROM product_variants pv JOIN products p ON p.id = pv.product_id
      WHERE pv.organization_id = p_organization_id AND pv.deleted_at IS NULL
    )
    SELECT vt.*, (vt.opening_qty + vt.purchase_qty - vt.sale_qty - vt.purchase_return_qty + vt.sale_return_qty) as calculated_stock
    FROM variant_transactions vt
    WHERE vt.current_stock_qty != (vt.opening_qty + vt.purchase_qty - vt.sale_qty - vt.purchase_return_qty + vt.sale_return_qty)
  LOOP
    UPDATE product_variants SET stock_qty = v_record.calculated_stock, updated_at = NOW() WHERE id = v_record.variant_id;
    
    INSERT INTO stock_movements (variant_id, movement_type, quantity, notes, organization_id, user_id)
    VALUES (v_record.variant_id, 'stock_reset', 0,
      'Stock reset from transactions: opening=' || v_record.opening_qty || ', purchases=' || v_record.purchase_qty || ', sales=' || v_record.sale_qty || ', pur_returns=' || v_record.purchase_return_qty || ', sale_returns=' || v_record.sale_return_qty || ' | old_qty=' || v_record.current_stock_qty || ', new_qty=' || v_record.calculated_stock,
      p_organization_id, auth.uid());
    
    v_fixed_count := v_fixed_count + 1;
    v_details := v_details || jsonb_build_object(
      'barcode', v_record.barcode, 'product_name', v_record.product_name, 'size', v_record.size,
      'old_qty', v_record.current_stock_qty, 'new_qty', v_record.calculated_stock,
      'opening', v_record.opening_qty, 'purchases', v_record.purchase_qty, 'sales', v_record.sale_qty,
      'pur_returns', v_record.purchase_return_qty, 'sale_returns', v_record.sale_return_qty
    );
  END LOOP;
  
  RETURN QUERY SELECT v_fixed_count, v_details;
END;
$function$;
