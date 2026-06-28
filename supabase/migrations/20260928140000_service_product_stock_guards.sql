-- Skip all stock effects for product_type = 'service'.
-- Additive guards only: full existing function bodies preserved beneath each guard.

-- 1. update_stock_on_purchase
CREATE OR REPLACE FUNCTION public.update_stock_on_purchase()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_purchase_date timestamptz;
  v_bill_number text;
  v_org_id uuid;
  v_rows_updated integer;
  v_product_type text;
BEGIN
  IF COALESCE(current_setting('app.bulk_purchase_insert', true), '') = '1' THEN
    RETURN NEW;
  END IF;

  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.sku_id IS NULL THEN
    RAISE EXCEPTION 'Cannot add purchase stock: sku_id is missing for product % size %',
      COALESCE(NEW.product_name, 'unknown'), COALESCE(NEW.size, 'unknown');
  END IF;

  IF COALESCE(NEW.qty, 0) <= 0 THEN
    RAISE EXCEPTION 'Cannot add purchase stock: qty must be greater than 0';
  END IF;

  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = NEW.sku_id
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN NEW;
  END IF;

  SELECT bill_date, software_bill_no, organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM public.purchase_bills
  WHERE id = NEW.bill_id;

  UPDATE public.product_variants
  SET stock_qty = stock_qty + NEW.qty, updated_at = NOW()
  WHERE id = NEW.sku_id;

  GET DIAGNOSTICS v_rows_updated = ROW_COUNT;
  IF v_rows_updated = 0 THEN
    RAISE EXCEPTION 'Cannot add purchase stock: variant % not found', NEW.sku_id;
  END IF;

  INSERT INTO public.batch_stock (variant_id, bill_number, quantity, purchase_bill_id, purchase_date, organization_id)
  VALUES (NEW.sku_id, v_bill_number, NEW.qty, NEW.bill_id, v_purchase_date, v_org_id)
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET quantity = public.batch_stock.quantity + EXCLUDED.quantity, updated_at = NOW();

  INSERT INTO public.stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
  VALUES (NEW.sku_id, 'purchase', NEW.qty, NEW.bill_id, v_bill_number, 'Stock added from purchase bill ' || v_bill_number, v_org_id, auth.uid());

  RETURN NEW;
END;
$function$;

-- 2. handle_purchase_item_update
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
  v_sku_changed BOOLEAN;
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = COALESCE(NEW.sku_id, OLD.sku_id)
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN NEW;
  END IF;

  v_sku_changed := OLD.sku_id IS DISTINCT FROM NEW.sku_id;

  IF NOT v_sku_changed AND OLD.qty = NEW.qty THEN
    RETURN NEW;
  END IF;

  SELECT pb.bill_date, pb.software_bill_no, pb.organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM purchase_bills pb WHERE pb.id = NEW.bill_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID not found for purchase bill';
  END IF;

  IF v_sku_changed THEN
    IF OLD.sku_id IS NOT NULL THEN
      UPDATE product_variants
      SET stock_qty = stock_qty - OLD.qty, updated_at = NOW()
      WHERE id = OLD.sku_id;

      UPDATE batch_stock
      SET quantity = quantity - OLD.qty, updated_at = NOW()
      WHERE variant_id = OLD.sku_id AND bill_number = v_bill_number;

      DELETE FROM batch_stock
      WHERE variant_id = OLD.sku_id
        AND bill_number = v_bill_number
        AND quantity <= 0;

      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
      VALUES (OLD.sku_id, 'purchase_sku_change_out', -OLD.qty, NEW.bill_id, v_bill_number,
        'Purchase variant changed: reversed ' || OLD.qty || ' from old variant in bill ' || v_bill_number,
        v_org_id, auth.uid());
    END IF;

    IF NEW.sku_id IS NOT NULL THEN
      UPDATE product_variants
      SET stock_qty = stock_qty + NEW.qty, updated_at = NOW()
      WHERE id = NEW.sku_id;

      INSERT INTO batch_stock (variant_id, bill_number, quantity, purchase_bill_id, purchase_date, organization_id)
      VALUES (NEW.sku_id, v_bill_number, NEW.qty, NEW.bill_id, v_purchase_date, v_org_id)
      ON CONFLICT (variant_id, bill_number)
      DO UPDATE SET quantity = batch_stock.quantity + NEW.qty, updated_at = NOW();

      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
      VALUES (NEW.sku_id, 'purchase_sku_change_in', NEW.qty, NEW.bill_id, v_bill_number,
        'Purchase variant changed: added ' || NEW.qty || ' to new variant in bill ' || v_bill_number,
        v_org_id, auth.uid());
    END IF;

    RETURN NEW;
  END IF;

  v_qty_difference := NEW.qty - OLD.qty;

  UPDATE product_variants
  SET stock_qty = stock_qty + v_qty_difference, updated_at = NOW()
  WHERE id = NEW.sku_id;

  INSERT INTO batch_stock (variant_id, bill_number, quantity, purchase_bill_id, purchase_date, organization_id)
  VALUES (NEW.sku_id, v_bill_number, v_qty_difference, NEW.bill_id, v_purchase_date, v_org_id)
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET quantity = batch_stock.quantity + v_qty_difference, updated_at = NOW();

  DELETE FROM batch_stock
  WHERE variant_id = NEW.sku_id
    AND bill_number = v_bill_number
    AND quantity <= 0;

  INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
  VALUES (NEW.sku_id,
    CASE WHEN v_qty_difference > 0 THEN 'purchase_increase' ELSE 'purchase_decrease' END,
    v_qty_difference, NEW.bill_id, v_bill_number,
    'Stock adjusted: Purchase qty changed from ' || OLD.qty || ' to ' || NEW.qty || ' in bill ' || v_bill_number,
    v_org_id, auth.uid());

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in purchase_item_update trigger: %', SQLERRM;
END;
$$;

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

-- 4. deduct_stock_on_purchase_return
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
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = NEW.sku_id
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN NEW;
  END IF;

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

-- 5. handle_purchase_return_item_delete
CREATE OR REPLACE FUNCTION public.handle_purchase_return_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_batch RECORD;
  v_remaining_qty INTEGER := OLD.qty;
  v_restore_qty INTEGER;
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

  SELECT organization_id INTO v_org_id FROM purchase_returns WHERE id = OLD.return_id;

  UPDATE product_variants
  SET stock_qty = stock_qty + OLD.qty, updated_at = NOW()
  WHERE id = OLD.sku_id;

  FOR v_batch IN
    SELECT bs.id, bs.bill_number, bs.quantity,
           COALESCE((
             SELECT SUM(ABS(sm.quantity))
             FROM stock_movements sm
             WHERE sm.variant_id = OLD.sku_id
               AND sm.bill_number = bs.bill_number
               AND sm.movement_type = 'purchase_return'
               AND sm.reference_id = OLD.return_id
           ), 0) as previously_deducted
    FROM batch_stock bs
    WHERE bs.variant_id = OLD.sku_id
    ORDER BY bs.purchase_date DESC, bs.created_at DESC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;

    v_restore_qty := LEAST(v_remaining_qty, v_batch.previously_deducted);

    IF v_restore_qty > 0 THEN
      UPDATE batch_stock
      SET quantity = quantity + v_restore_qty, updated_at = NOW()
      WHERE id = v_batch.id;

      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
      VALUES (OLD.sku_id, 'purchase_return_delete', v_restore_qty, OLD.return_id, v_batch.bill_number,
        'Purchase return deleted: ' || v_restore_qty || ' units restored to batch ' || v_batch.bill_number,
        v_org_id, auth.uid());

      v_remaining_qty := v_remaining_qty - v_restore_qty;
    END IF;
  END LOOP;

  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.sku_id, 'purchase_return_delete', v_remaining_qty, OLD.return_id, NULL,
      'Purchase return deleted: ' || v_remaining_qty || ' units (original batch no longer available)',
      v_org_id, auth.uid());
  END IF;

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in purchase_return_item_delete trigger: %', SQLERRM;
END;
$$;

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

-- 7. handle_sale_item_update
CREATE OR REPLACE FUNCTION public.handle_sale_item_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = COALESCE(NEW.variant_id, OLD.variant_id)
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity != OLD.quantity THEN
    UPDATE product_variants
    SET stock_qty = stock_qty + (OLD.quantity - NEW.quantity),
        updated_at = now()
    WHERE id = NEW.variant_id;

    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, notes)
    SELECT NEW.variant_id, s.organization_id, 'sale_edit',
           (OLD.quantity - NEW.quantity), NEW.sale_id,
           'Sale item qty updated from ' || OLD.quantity || ' to ' || NEW.quantity
    FROM sales s WHERE s.id = NEW.sale_id;
  END IF;

  RETURN NEW;
END;
$$;

-- 8. handle_sale_item_delete
CREATE OR REPLACE FUNCTION public.handle_sale_item_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sale_number TEXT;
  v_org_id UUID;
  v_remaining_qty INTEGER := OLD.quantity;
  v_batch RECORD;
  v_restore_qty INTEGER;
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = OLD.variant_id
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN OLD;
  END IF;

  IF OLD.deleted_at IS NOT NULL THEN RETURN OLD; END IF;
  SELECT s.sale_number, s.organization_id INTO v_sale_number, v_org_id FROM sales s WHERE s.id = OLD.sale_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Org not found'; END IF;
  UPDATE product_variants SET stock_qty = stock_qty + OLD.quantity, updated_at = NOW() WHERE id = OLD.variant_id;
  FOR v_batch IN SELECT id, bill_number, quantity FROM batch_stock WHERE variant_id = OLD.variant_id ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_restore_qty := LEAST(v_remaining_qty, v_batch.quantity);
    UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = NOW() WHERE id = v_batch.id;
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'sale_delete', v_restore_qty, OLD.sale_id, v_batch.bill_number,
      'Stock restored (delete): ' || v_restore_qty || ' to batch ' || v_batch.bill_number, v_org_id, auth.uid());
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'sale_delete', v_remaining_qty, OLD.sale_id,
      'Stock restored (delete): ' || v_remaining_qty || ' from opening stock', v_org_id, auth.uid());
  END IF;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Error in sale_item_delete: %', SQLERRM;
END;
$$;

-- 9. restore_stock_on_sale_return
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
  v_total_sold INTEGER;
  v_total_returned INTEGER;
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

  SELECT COALESCE(SUM(quantity), 0) INTO v_total_sold
  FROM sale_items WHERE variant_id = NEW.variant_id AND deleted_at IS NULL;
  SELECT COALESCE(SUM(quantity), 0) INTO v_total_returned
  FROM sale_return_items WHERE variant_id = NEW.variant_id
    AND deleted_at IS NULL AND id != NEW.id;
  IF (v_total_returned + NEW.quantity) > v_total_sold THEN
    RAISE EXCEPTION 'Cannot return % units of this product — only % sold, % already returned',
      NEW.quantity, v_total_sold, v_total_returned;
  END IF;

  SELECT return_date, organization_id INTO v_return_date, v_org_id FROM sale_returns WHERE id = NEW.return_id;
  UPDATE product_variants SET stock_qty = stock_qty + NEW.quantity, updated_at = NOW() WHERE id = NEW.variant_id;
  FOR v_batch IN SELECT id, bill_number, quantity FROM batch_stock WHERE variant_id = NEW.variant_id ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_restore_qty := LEAST(v_remaining_qty, v_batch.quantity);
    UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = NOW() WHERE id = v_batch.id;
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'sale_return', v_restore_qty, NEW.return_id, v_batch.bill_number,
      'Sale return: ' || v_restore_qty || ' units restored to batch ' || v_batch.bill_number, v_org_id, auth.uid());
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'sale_return', v_remaining_qty, NEW.return_id, NULL,
      'Sale return to opening stock: ' || v_remaining_qty || ' units', v_org_id, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

-- 10. handle_sale_return_item_delete
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
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = OLD.variant_id
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN OLD;
  END IF;

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

-- 11. update_stock_on_challan
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
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = NEW.variant_id
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN NEW;
  END IF;

  SELECT organization_id INTO v_org_id FROM delivery_challans WHERE id = NEW.challan_id;

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

-- 12. handle_challan_item_delete
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
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = OLD.variant_id
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN OLD;
  END IF;

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

-- 13. _apply_bulk_purchase_insert_effects (RPC)
CREATE OR REPLACE FUNCTION public._apply_bulk_purchase_insert_effects(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $function$
DECLARE
  v_purchase_date timestamptz;
  v_bill_number text;
  v_org_id uuid;
  v_missing_variants integer;
BEGIN
  SELECT bill_date, software_bill_no, organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM public.purchase_bills
  WHERE id = p_bill_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill % not found for bulk insert effects', p_bill_id;
  END IF;

  UPDATE public.purchase_bills
  SET
    total_qty = (
      SELECT COALESCE(SUM(pi.qty), 0)::integer
      FROM public.purchase_items pi
      WHERE pi.bill_id = p_bill_id
        AND pi.deleted_at IS NULL
    ),
    total_items = (
      SELECT COUNT(*)::integer
      FROM public.purchase_items pi
      WHERE pi.bill_id = p_bill_id
        AND pi.deleted_at IS NULL
    )
  WHERE id = p_bill_id;

  WITH agg AS (
    SELECT pi.sku_id, SUM(pi.qty) AS qty
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_variants pv
        JOIN public.products p ON p.id = pv.product_id
        WHERE pv.id = pi.sku_id
          AND p.product_type = 'service'
      )
    GROUP BY pi.sku_id
  )
  SELECT COUNT(*)::integer
  INTO v_missing_variants
  FROM agg
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_variants pv WHERE pv.id = agg.sku_id
  );

  IF v_missing_variants > 0 THEN
    RAISE EXCEPTION 'Cannot add purchase stock: % variant(s) not found', v_missing_variants;
  END IF;

  WITH agg AS (
    SELECT pi.sku_id, SUM(pi.qty) AS qty
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_variants pv
        JOIN public.products p ON p.id = pv.product_id
        WHERE pv.id = pi.sku_id
          AND p.product_type = 'service'
      )
    GROUP BY pi.sku_id
  )
  UPDATE public.product_variants pv
  SET stock_qty = pv.stock_qty + agg.qty::integer,
      updated_at = NOW()
  FROM agg
  WHERE pv.id = agg.sku_id;

  WITH agg AS (
    SELECT pi.sku_id, SUM(pi.qty) AS qty
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.product_variants pv
        JOIN public.products p ON p.id = pv.product_id
        WHERE pv.id = pi.sku_id
          AND p.product_type = 'service'
      )
    GROUP BY pi.sku_id
  )
  INSERT INTO public.batch_stock (
    variant_id,
    bill_number,
    quantity,
    purchase_bill_id,
    purchase_date,
    organization_id
  )
  SELECT
    agg.sku_id,
    v_bill_number,
    agg.qty::integer,
    p_bill_id,
    v_purchase_date,
    v_org_id
  FROM agg
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET
    quantity = public.batch_stock.quantity + EXCLUDED.quantity,
    updated_at = NOW();

  INSERT INTO public.stock_movements (
    variant_id,
    movement_type,
    quantity,
    reference_id,
    bill_number,
    notes,
    organization_id,
    user_id
  )
  SELECT
    pi.sku_id,
    'purchase',
    pi.qty,
    p_bill_id,
    v_bill_number,
    'Stock added from purchase bill ' || v_bill_number,
    v_org_id,
    auth.uid()
  FROM public.purchase_items pi
  WHERE pi.bill_id = p_bill_id
    AND pi.deleted_at IS NULL
    AND pi.sku_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.product_variants pv
      JOIN public.products p ON p.id = pv.product_id
      WHERE pv.id = pi.sku_id
        AND p.product_type = 'service'
    );

  UPDATE public.product_variants pv
  SET
    last_purchase_pur_price = latest.pur_price,
    last_purchase_sale_price = latest.sale_price,
    last_purchase_mrp = latest.mrp,
    last_purchase_date = NOW(),
    updated_at = NOW()
  FROM (
    SELECT DISTINCT ON (pi.sku_id)
      pi.sku_id,
      pi.pur_price,
      pi.sale_price,
      pi.mrp
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    ORDER BY pi.sku_id, pi.ctid DESC
  ) AS latest
  WHERE pv.id = latest.sku_id;
END;
$function$;
